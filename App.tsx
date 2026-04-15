// App.tsx — IkunImage 根组件（多对话管理 + 自定义模态框）

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Theme, GalleryItem, ImageGenMode, ImageModel, OptimizeConfig, Conversation, ChatHistoryItem } from './types';
import {
  LS_API_KEY,
  LS_IMAGE_BASE_URL,
  LS_THEME,
  LS_GALLERY,
  LS_MODEL,
  LS_OPTIMIZE_CONFIG,
  DEFAULT_BASE_URL,
  DEFAULT_OPTIMIZE_CONFIG,
  STYLE_PRESETS,
  LS_CONVERSATIONS,
  LS_ACTIVE_CONV,
  normalizeBaseUrl,
} from './constants';
import { generateImage } from './services/imageGenService';
import { saveImage, deleteImage, loadImage } from './services/imageStore';
import KeySetup from './components/KeySetup';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ImageGallery from './components/ImageGallery';
import PromptBar from './components/PromptBar';
import Modal from './components/Modal';
import HistoryGallery from './components/HistoryGallery';
import type { ModalConfig } from './components/Modal';

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const App: React.FC = () => {
  // ── State ──────────────────────────────────────────────
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(LS_API_KEY));
  const [imageBaseUrl, setImageBaseUrl] = useState<string>(() => normalizeBaseUrl(localStorage.getItem(LS_IMAGE_BASE_URL) || DEFAULT_BASE_URL));
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(LS_THEME) as Theme) || 'dark');
  const [model, setModel] = useState<ImageModel>(() => (localStorage.getItem(LS_MODEL) as ImageModel) || 'nano-banana');
  const [optimizeConfig, setOptimizeConfig] = useState<OptimizeConfig>(() => {
    try {
      const raw = localStorage.getItem(LS_OPTIMIZE_CONFIG);
      return raw ? JSON.parse(raw) : DEFAULT_OPTIMIZE_CONFIG;
    } catch { return DEFAULT_OPTIMIZE_CONFIG; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>();
  const [currentInputImage, setCurrentInputImage] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showApiSetup, setShowApiSetup] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── 多对话状态 ────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const raw = localStorage.getItem(LS_CONVERSATIONS);
      if (raw) return JSON.parse(raw);
      // 迁移旧数据
      const oldGallery = localStorage.getItem(LS_GALLERY);
      if (oldGallery) {
        const items: GalleryItem[] = JSON.parse(oldGallery);
        if (items.length > 0) {
          return [{
            id: `conv_${genId()}`,
            title: items[0]?.prompt?.slice(0, 30) || '历史对话',
            createdAt: items[0]?.timestamp || Date.now(),
            updatedAt: items[items.length - 1]?.timestamp || Date.now(),
            items,
          }];
        }
      }
      return [];
    } catch { return []; }
  });

  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    const saved = localStorage.getItem(LS_ACTIVE_CONV);
    return saved || null;
  });

  // 当前对话的 items
  const activeItems = useMemo(() => {
    return conversations.find(c => c.id === activeConvId)?.items || [];
  }, [conversations, activeConvId]);

  // 所有对话总项数（用于侧栏显示）
  const totalItems = useMemo(() => conversations.reduce((s, c) => s + c.items.length, 0), [conversations]);

  // ── 模态框 ────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<ModalConfig>({ title: '', message: '' });

  const showMessage = useCallback((title: string, message: string, variant?: 'info' | 'warning' | 'error') => {
    setModalConfig({ title, message, variant });
    setModalOpen(true);
  }, []);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, variant?: 'warning' | 'error') => {
    setModalConfig({ title, message, variant: variant || 'warning', onConfirm });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  // ── Persistence ────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_THEME, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConvId) localStorage.setItem(LS_ACTIVE_CONV, activeConvId);
    else localStorage.removeItem(LS_ACTIVE_CONV);
  }, [activeConvId]);

  // ── Handlers ───────────────────────────────────────────

  const handleSaveApiConfig = useCallback((key: string, baseUrl: string) => {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    localStorage.setItem(LS_API_KEY, key);
    localStorage.setItem(LS_IMAGE_BASE_URL, normalizedBaseUrl);
    setApiKey(key);
    setImageBaseUrl(normalizedBaseUrl);
    setShowApiSetup(false);
  }, []);

  const handleOpenApiSetup = useCallback(() => {
    setShowApiSetup(true);
  }, []);

  const handleCloseApiSetup = useCallback(() => {
    if (!apiKey) return;
    setShowApiSetup(false);
  }, [apiKey]);

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const handleModelChange = useCallback((id: string) => {
    const m = id as ImageModel;
    localStorage.setItem(LS_MODEL, m);
    setModel(m);
  }, []);

  const handleOptimizeConfigChange = useCallback((config: OptimizeConfig) => {
    localStorage.setItem(LS_OPTIMIZE_CONFIG, JSON.stringify(config));
    setOptimizeConfig(config);
  }, []);

  // ── 对话管理 ───────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    // 如果当前对话是空的，不需要新建
    const current = conversations.find(c => c.id === activeConvId);
    if (current && current.items.length === 0) return;

    const newConv: Conversation = {
      id: `conv_${genId()}`,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: [],
    };
    setConversations(prev => [...prev, newConv]);
    setActiveConvId(newConv.id);
  }, [conversations, activeConvId]);

  const handleSelectConv = useCallback((id: string) => {
    if (isGenerating) return;
    setActiveConvId(id);
  }, [isGenerating]);

  const handleDeleteConv = useCallback((id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    // 清理 IndexedDB 图片
    for (const item of conv.items) {
      if (item.imageRef) deleteImage(item.imageRef).catch(() => {});
      if (item.inputImageRef) deleteImage(item.inputImageRef).catch(() => {});
    }
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      setActiveConvId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  }, [conversations, activeConvId]);

  const handleClearAll = useCallback(() => {
    if (conversations.length === 0) return;
    showConfirm('清空所有对话', '确定要删除所有对话记录吗？此操作不可撤销。', () => {
      for (const conv of conversations) {
        for (const item of conv.items) {
          if (item.imageRef) deleteImage(item.imageRef).catch(() => {});
          if (item.inputImageRef) deleteImage(item.inputImageRef).catch(() => {});
        }
      }
      setConversations([]);
      setActiveConvId(null);
    }, 'error');
  }, [conversations, showConfirm]);

  const handleDeleteItem = useCallback(async (id: string) => {
    if (!activeConvId) return;
    const conv = conversations.find(c => c.id === activeConvId);
    const item = conv?.items.find(g => g.id === id);
    if (!item) return;
    try {
      if (item.imageRef) await deleteImage(item.imageRef);
      if (item.inputImageRef) await deleteImage(item.inputImageRef);
    } catch (e) {
      console.warn('删除图片失败:', e);
    }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId
        ? { ...c, items: c.items.filter(g => g.id !== id) }
        : c
    ));
  }, [conversations, activeConvId]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setCurrentPrompt(undefined);
    setCurrentInputImage(undefined);
  }, []);

  const handleToggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const handleOpenSettings = useCallback(() => setShowSettingsMenu(prev => !prev), []);

  // ── 生成 ───────────────────────────────────────────────

  const handleGenerate = useCallback(async (params: {
    prompt: string;
    mode: ImageGenMode;
    aspectRatio: string;
    size: string;
    styleId: string;
    inputImage?: string;
    inputImageMimeType?: string;
  }) => {
    if (!apiKey || isGenerating) return;

    // 确保有活跃对话
    let targetConvId = activeConvId;
    if (!targetConvId) {
      const newId = `conv_${genId()}`;
      const newConv: Conversation = {
        id: newId,
        title: params.prompt.slice(0, 30) || '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        items: [],
      };
      setConversations(prev => [...prev, newConv]);
      setActiveConvId(newId);
      targetConvId = newId;
    }
    const convId = targetConvId;

    const style = STYLE_PRESETS.find(s => s.id === params.styleId);
    const prefix = style?.prefix || '';
    const fullPrompt = prefix ? `${prefix}${params.prompt}` : params.prompt;

    setIsGenerating(true);
    setCurrentPrompt(params.prompt);
    setCurrentInputImage(params.inputImage);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let inputImageRef: string | undefined;
      if (params.inputImage) {
        inputImageRef = await saveImage(params.inputImage);
      }

      // 构建多轮对话历史（仅包含成功生成的记录）
      const conv = conversations.find(c => c.id === convId);
      const successItems = (conv?.items ?? []).filter(it => it.imageRef && !it.error);
      const history: ChatHistoryItem[] = [];
      for (const it of successItems) {
        const imgData = it.imageRef ? await loadImage(it.imageRef) : null;
        history.push({
          prompt: it.prompt,
          imageData: imgData ?? undefined,
        });
      }

      const result = await generateImage(
        apiKey,
        imageBaseUrl,
        {
          model,
          mode: params.mode,
          prompt: fullPrompt,
          aspectRatio: params.aspectRatio,
          size: params.size,
          inputImage: params.inputImage,
          inputImageMimeType: params.inputImageMimeType,
          history,
        },
        null,
        controller.signal,
      );

      if (result.success && result.imageData) {
        const imageRef = await saveImage(result.imageData);
        const item: GalleryItem = {
          id: genId(),
          timestamp: Date.now(),
          prompt: params.prompt,
          optimizedPrompt: result.optimizedPrompt,
          aspectRatio: params.aspectRatio,
          size: params.size,
          mode: params.mode,
          model,
          imageRef,
          elapsed: result.elapsed,
          inputImageRef,
        };
        setConversations(prev => prev.map(c =>
          c.id === convId
            ? {
                ...c,
                items: [...c.items, item],
                updatedAt: Date.now(),
                title: c.items.length === 0 ? params.prompt.slice(0, 30) : c.title,
              }
            : c
        ));
      } else {
        // 失败也保留用户消息，附带错误信息
        const errorItem: GalleryItem = {
          id: genId(),
          timestamp: Date.now(),
          prompt: params.prompt,
          aspectRatio: params.aspectRatio,
          size: params.size,
          mode: params.mode,
          model,
          elapsed: result.elapsed,
          inputImageRef,
          error: result.error || '未知错误',
        };
        setConversations(prev => prev.map(c =>
          c.id === convId
            ? {
                ...c,
                items: [...c.items, errorItem],
                updatedAt: Date.now(),
                title: c.items.length === 0 ? params.prompt.slice(0, 30) : c.title,
              }
            : c
        ));
        showMessage('生成失败', result.error || '未知错误', 'error');
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const errMsg = e instanceof Error ? e.message : String(e);
      // 异常也保留用户消息
      const errorItem: GalleryItem = {
        id: genId(),
        timestamp: Date.now(),
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        size: params.size,
        mode: params.mode,
        model,
        elapsed: Date.now() - Date.now(),
        error: errMsg,
      };
      setConversations(prev => prev.map(c =>
        c.id === convId
          ? {
              ...c,
              items: [...c.items, errorItem],
              updatedAt: Date.now(),
              title: c.items.length === 0 ? params.prompt.slice(0, 30) : c.title,
            }
          : c
      ));
      showMessage('生成出错', errMsg, 'error');
    } finally {
      setIsGenerating(false);
      setCurrentPrompt(undefined);
      setCurrentInputImage(undefined);
      abortRef.current = null;
    }
  }, [apiKey, imageBaseUrl, isGenerating, model, showMessage, activeConvId]);

  // ── Render ─────────────────────────────────────────────

  if (!apiKey || showApiSetup) {
    return (
      <div className="h-full">
        <KeySetup
          theme={theme}
          initialKey={apiKey || ''}
          initialBaseUrl={imageBaseUrl}
          onSubmit={handleSaveApiConfig}
          onCancel={apiKey ? handleCloseApiSetup : undefined}
        />
      </div>
    );
  }

  return (
    <div className={`h-full flex ${theme === 'dark' ? 'bg-[#1a1a18]' : 'bg-gray-50'}`}>
      <Sidebar
        theme={theme}
        isOpen={sidebarOpen}
        conversations={conversations}
        activeConvId={activeConvId}
        onClose={handleCloseSidebar}
        onSelectConv={handleSelectConv}
        onDeleteConv={handleDeleteConv}
        onClearAll={handleClearAll}
        onOpenSettings={handleOpenSettings}
        onNewChat={handleNewChat}
      />

      <div className={`flex-1 flex flex-col min-w-0 ${theme === 'dark' ? 'bg-[#1e1e1c]' : 'bg-white'}`}>
        <Header
          theme={theme}
          model={model}
          optimizeConfig={optimizeConfig}
          showSettingsMenu={showSettingsMenu}
          onToggleTheme={handleToggleTheme}
          onOpenApiSetup={handleOpenApiSetup}
          onClearGallery={handleClearAll}
          onOptimizeConfigChange={handleOptimizeConfigChange}
          onToggleSidebar={handleToggleSidebar}
          onToggleSettings={handleOpenSettings}
          onCloseSettings={() => setShowSettingsMenu(false)}
          onShowHistory={() => setShowHistory(true)}
        />
        <ImageGallery
          theme={theme}
          items={activeItems}
          isGenerating={isGenerating}
          currentPrompt={currentPrompt}
          currentInputImage={currentInputImage}
        />
        <PromptBar
          theme={theme}
          isGenerating={isGenerating}
          model={model}
          optimizeConfig={optimizeConfig}
          onModelChange={handleModelChange}
          onGenerate={handleGenerate}
          onCancel={handleCancel}
          onMessage={showMessage}
        />
      </div>

      <Modal open={modalOpen} theme={theme} config={modalConfig} onClose={closeModal} />
      <HistoryGallery open={showHistory} theme={theme} conversations={conversations} onClose={() => setShowHistory(false)} />
    </div>
  );
};

export default App;
