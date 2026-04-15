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
  // 按对话隔离的生成状态 Map<convId, { prompt, inputImages, startTime, controller }>
  const generatingMapRef = useRef<Map<string, { prompt: string; inputImages?: Array<{ data: string; mimeType: string }>; startTime: number; controller: AbortController }>>(new Map());
  const [generatingConvIds, setGeneratingConvIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showApiSetup, setShowApiSetup] = useState(false);

  // ── 多对话状态 ────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const raw = localStorage.getItem(LS_CONVERSATIONS);
      if (raw) {
        const convs: Conversation[] = JSON.parse(raw);
        // 兼容旧数据：inputImageRef → inputImageRefs
        for (const c of convs) {
          for (const it of c.items) {
            const legacy = it as unknown as { inputImageRef?: string };
            if (legacy.inputImageRef && !it.inputImageRefs) {
              it.inputImageRefs = [legacy.inputImageRef];
              delete legacy.inputImageRef;
            }
          }
        }
        return convs;
      }
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

  // 当前对话的生成状态
  const isGenerating = activeConvId ? generatingConvIds.has(activeConvId) : false;
  const activeGenState = activeConvId ? generatingMapRef.current.get(activeConvId) : undefined;
  const currentPrompt = activeGenState?.prompt;
  const currentInputImages = activeGenState?.inputImages;
  const generatingStartTime = activeGenState?.startTime;

  // 所有对话总项数（用于侧栏显示）
  const totalItems = useMemo(() => conversations.reduce((s, c) => s + c.items.filter(it => !it.error).length, 0), [conversations]);

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
    // 如果当前对话是空的且没在生成，不需要新建
    const current = conversations.find(c => c.id === activeConvId);
    const currentGenerating = activeConvId ? generatingConvIds.has(activeConvId) : false;
    if (current && current.items.length === 0 && !currentGenerating) return;

    const newConv: Conversation = {
      id: `conv_${genId()}`,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: [],
    };
    setConversations(prev => [...prev, newConv]);
    setActiveConvId(newConv.id);
  }, [conversations, activeConvId, generatingConvIds]);

  const handleSelectConv = useCallback((id: string) => {
    setActiveConvId(id);
  }, []);

  const handleDeleteConv = useCallback((id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    // 清理 IndexedDB 图片
    for (const item of conv.items) {
      if (item.imageRef) deleteImage(item.imageRef).catch(() => {});
      if (item.inputImageRefs) item.inputImageRefs.forEach(ref => deleteImage(ref).catch(() => {}));
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
          if (item.inputImageRefs) item.inputImageRefs.forEach(ref => deleteImage(ref).catch(() => {}));
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
      if (item.inputImageRefs) {
        for (const ref of item.inputImageRefs) await deleteImage(ref);
      }
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
    if (!activeConvId) return;
    const state = generatingMapRef.current.get(activeConvId);
    if (state) {
      state.controller.abort();
      generatingMapRef.current.delete(activeConvId);
      setGeneratingConvIds(prev => { const next = new Set(prev); next.delete(activeConvId); return next; });
    }
  }, [activeConvId]);

  const handleToggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const handleOpenSettings = useCallback(() => setShowSettingsMenu(prev => !prev), []);

  // ── 生成 ───────────────────────────────────────────────

  const buildHistory = useCallback(async (items: GalleryItem[]): Promise<ChatHistoryItem[]> => {
    const successItems = items.filter(it => it.imageRef && !it.error);
    const history: ChatHistoryItem[] = [];
    for (const it of successItems) {
      const imgData = it.imageRef ? await loadImage(it.imageRef) : null;
      history.push({
        prompt: it.prompt,
        imageData: imgData ?? undefined,
      });
    }
    return history;
  }, []);

  const handleGenerate = useCallback(async (params: {
    prompt: string;
    mode: ImageGenMode;
    aspectRatio: string;
    size: string;
    styleId: string;
    inputImages?: Array<{ data: string; mimeType: string }>;
    historyItems?: GalleryItem[];
  }) => {
    if (!apiKey) return;

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

    // 如果该对话已在生成，不重复触发
    if (generatingMapRef.current.has(convId)) return;

    // 立即更新会话标题（不等待 API 响应）
    setConversations(prev => prev.map(c =>
      c.id === convId && c.items.length === 0
        ? { ...c, title: params.prompt.slice(0, 30) || '新对话', updatedAt: Date.now() }
        : c
    ));

    const style = STYLE_PRESETS.find(s => s.id === params.styleId);
    const prefix = style?.prefix || '';
    const fullPrompt = prefix ? `${prefix}${params.prompt}` : params.prompt;

    const controller = new AbortController();
    const startTime = performance.now();
    generatingMapRef.current.set(convId, { prompt: params.prompt, inputImages: params.inputImages, startTime, controller });
    setGeneratingConvIds(prev => new Set(prev).add(convId));
    const inputImageRefs: string[] = [];

    try {
      // 保存参考图到 IndexedDB
      if (params.inputImages?.length) {
        for (const img of params.inputImages) {
          inputImageRefs.push(await saveImage(img.data));
        }
      }

      // 构建多轮对话历史（仅包含成功生成的记录）
      const historySource = params.historyItems ?? conversations.find(c => c.id === convId)?.items ?? [];
      const history = await buildHistory(historySource);

      const result = await generateImage(
        apiKey,
        imageBaseUrl,
        {
          model,
          mode: params.mode,
          prompt: fullPrompt,
          aspectRatio: params.aspectRatio,
          size: params.size,
          inputImages: params.inputImages,
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
          inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
        };
        setConversations(prev => prev.map(c =>
          c.id === convId
            ? {
                ...c,
                items: [...c.items, item],
                updatedAt: Date.now(),
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
          inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
          error: result.error || '未知错误',
        };
        setConversations(prev => prev.map(c =>
          c.id === convId
            ? {
                ...c,
                items: [...c.items, errorItem],
                updatedAt: Date.now(),
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
        elapsed: Math.round(performance.now() - startTime),
        inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
        error: errMsg,
      };
      setConversations(prev => prev.map(c =>
        c.id === convId
          ? {
              ...c,
              items: [...c.items, errorItem],
              updatedAt: Date.now(),
            }
          : c
      ));
      showMessage('生成出错', errMsg, 'error');
    } finally {
      generatingMapRef.current.delete(convId);
      setGeneratingConvIds(prev => { const next = new Set(prev); next.delete(convId); return next; });
    }
  }, [apiKey, imageBaseUrl, model, showMessage, activeConvId, conversations, buildHistory]);

  const handleEditItem = useCallback(async (itemId: string, newPrompt: string, inputImages?: Array<{ data: string; mimeType: string }>) => {
    if (!activeConvId || generatingConvIds.has(activeConvId)) return;
    const conv = conversations.find(c => c.id === activeConvId);
    if (!conv) return;

    const idx = conv.items.findIndex(g => g.id === itemId);
    if (idx === -1) return;

    // 截断：删除该 item 及之后的所有 items，清理 IndexedDB 图片
    const removedItems = conv.items.slice(idx);
    for (const it of removedItems) {
      if (it.imageRef) deleteImage(it.imageRef).catch(() => {});
      if (it.inputImageRefs) it.inputImageRefs.forEach(ref => deleteImage(ref).catch(() => {}));
    }

    const keptItems = conv.items.slice(0, idx);
    setConversations(prev => prev.map(c =>
      c.id === activeConvId
        ? { ...c, items: keptItems, updatedAt: Date.now() }
        : c
    ));

    // 用编辑后的 prompt 和参考图重新生成
    const editedItem = conv.items[idx];
    handleGenerate({
      prompt: newPrompt,
      mode: inputImages?.length ? 'img2img' : 'text2img',
      aspectRatio: editedItem.aspectRatio,
      size: editedItem.size,
      styleId: 'none',
      inputImages,
      historyItems: keptItems,
    });
  }, [activeConvId, conversations, generatingConvIds, handleGenerate]);

  const handleRegenerateItem = useCallback(async (itemId: string) => {
    if (!activeConvId) return;
    const conv = conversations.find(c => c.id === activeConvId);
    const item = conv?.items.find(g => g.id === itemId);
    if (!item) return;
    // 加载原始参考图数据
    let inputImages: Array<{ data: string; mimeType: string }> | undefined;
    if (item.inputImageRefs?.length) {
      const loaded: Array<{ data: string; mimeType: string }> = [];
      for (const ref of item.inputImageRefs) {
        const imgData = await loadImage(ref);
        if (imgData) {
          const match = imgData.match(/^data:(image\/[^;]+);/);
          loaded.push({ data: imgData, mimeType: match ? match[1] : 'image/png' });
        }
      }
      if (loaded.length > 0) inputImages = loaded;
    }
    handleEditItem(itemId, item.prompt, inputImages);
  }, [activeConvId, conversations, handleEditItem]);

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
        generatingConvIds={generatingConvIds}
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
          currentInputImages={currentInputImages}
          generatingStartTime={generatingStartTime}
          onEditItem={handleEditItem}
          onRegenerateItem={handleRegenerateItem}
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
