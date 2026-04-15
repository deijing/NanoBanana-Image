// components/ImageGallery.tsx — 图片消息流展示（响应式 + 灯箱预览）

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Theme, GalleryItem } from '../types';
import { IMAGE_MODELS } from '../constants';
import { loadImage } from '../services/imageStore';
import { ArrowDownTrayIcon, XMarkIcon, PencilIcon, CheckIcon, ArrowPathIcon, PhotoIcon } from './Icons';

interface ImageGalleryProps {
  theme: Theme;
  items: GalleryItem[];
  isGenerating: boolean;
  currentPrompt?: string;
  currentInputImages?: Array<{ data: string; mimeType: string }>;
  generatingStartTime?: number;
  onEditItem?: (itemId: string, newPrompt: string, inputImages?: Array<{ data: string; mimeType: string }>) => void;
  onRegenerateItem?: (itemId: string) => void;
}

/* ── 成功小动画 — 对勾弹出 + 星星粒子 ──────── */

const SuccessSparkle: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <span className="relative inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0">
    <svg viewBox="0 0 20 20" className="w-4 h-4 sm:w-5 sm:h-5 animate-successPop" fill="none">
      <circle cx="10" cy="10" r="9" className={isDark ? 'fill-amber-500/20' : 'fill-amber-100'} />
      <path d="M6 10.5 L8.5 13 L14 7" stroke={isDark ? '#f59e0b' : '#d97706'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-drawCheck" />
    </svg>
    <span className="absolute animate-sparkleOut" style={{ top: '-2px', left: '50%' }}>
      <span className={`block w-1 h-1 rounded-full ${isDark ? 'bg-amber-400' : 'bg-amber-500'}`} />
    </span>
    <span className="absolute animate-sparkleOut" style={{ bottom: '-2px', left: '50%', animationDelay: '120ms' }}>
      <span className={`block w-0.5 h-0.5 rounded-full ${isDark ? 'bg-orange-400' : 'bg-orange-500'}`} />
    </span>
    <span className="absolute animate-sparkleOut" style={{ top: '50%', left: '-2px', animationDelay: '60ms' }}>
      <span className={`block w-0.5 h-0.5 rounded-full ${isDark ? 'bg-yellow-300' : 'bg-yellow-500'}`} />
    </span>
    <span className="absolute animate-sparkleOut" style={{ top: '50%', right: '-2px', animationDelay: '180ms' }}>
      <span className={`block w-1 h-1 rounded-full ${isDark ? 'bg-amber-300' : 'bg-amber-400'}`} />
    </span>
  </span>
);

/* ── 图片灯箱预览 ──────────────────────────── */

const ImageLightbox: React.FC<{ src: string | null; onClose: () => void }> = ({ src, onClose }) => {
  useEffect(() => {
    if (!src) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [src, onClose]);

  if (!src) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    const ext = src.startsWith('data:image/png') ? 'png' : 'jpg';
    a.download = `nanoBanana_${Date.now()}.${ext}`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <img
        src={src}
        alt="预览"
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-modalIn"
        onClick={e => e.stopPropagation()}
      />
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={e => { e.stopPropagation(); handleDownload(); }}
          className="p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
          title="下载"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
          title="关闭"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/* ── 单个图片卡片 ──────────────────────────── */

const GalleryCard: React.FC<{
  item: GalleryItem;
  theme: Theme;
  onPreview: (src: string) => void;
  onEdit?: (itemId: string, newPrompt: string, inputImages?: Array<{ data: string; mimeType: string }>) => void;
  onRegenerate?: (itemId: string) => void;
  isGenerating: boolean;
}> = ({ item, theme, onPreview, onEdit, onRegenerate, isGenerating }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [inputImgSrcs, setInputImgSrcs] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editInputImages, setEditInputImages] = useState<Array<{ data: string; mimeType: string }>>([]);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';
  const isError = !!item.error;

  useEffect(() => {
    if (item.imageRef) loadImage(item.imageRef).then(setImgSrc);
  }, [item.imageRef]);

  useEffect(() => {
    if (item.inputImageRefs?.length) {
      Promise.all(item.inputImageRefs.map(ref => loadImage(ref))).then(srcs =>
        setInputImgSrcs(srcs.filter((s): s is string => !!s))
      );
    }
  }, [item.inputImageRefs]);

  const handleDownload = useCallback(() => {
    if (!imgSrc) return;
    const a = document.createElement('a');
    a.href = imgSrc;
    const ext = imgSrc.startsWith('data:image/png') ? 'png' : 'jpg';
    a.download = `nanoBanana_${item.id}.${ext}`;
    a.click();
  }, [imgSrc, item.id]);

  const modelName = IMAGE_MODELS.find(m => m.id === item.model)?.name || 'NanoBanana Pro';
  const elapsedStr = item.elapsed < 1000
    ? `${item.elapsed}ms`
    : `${(item.elapsed / 1000).toFixed(1)}s`;

  const handleStartEdit = useCallback(() => {
    setEditText(item.prompt);
    // 初始化参考图编辑状态
    if (inputImgSrcs.length > 0) {
      setEditInputImages(inputImgSrcs.map(src => {
        const match = src.match(/^data:(image\/[^;]+);/);
        return { data: src, mimeType: match ? match[1] : 'image/png' };
      }));
    } else {
      setEditInputImages([]);
    }
    setIsEditing(true);
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.focus();
        editRef.current.style.height = 'auto';
        editRef.current.style.height = `${editRef.current.scrollHeight}px`;
      }
    });
  }, [item.prompt, inputImgSrcs]);

  const handleConfirmEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || !onEdit) return;
    setIsEditing(false);
    onEdit(item.id, trimmed, editInputImages.length > 0 ? editInputImages : undefined);
  }, [editText, onEdit, item.id, editInputImages]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText('');
    setEditInputImages([]);
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e as unknown as { isComposing: boolean }).isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleConfirmEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleConfirmEdit, handleCancelEdit]);

  const handleEditImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const mimeType = file.type;
    const reader = new FileReader();
    reader.onload = () => {
      setEditInputImages(prev => [...prev, { data: reader.result as string, mimeType }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleEditPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const mimeType = file.type;
        const reader = new FileReader();
        reader.onload = () => {
          setEditInputImages(prev => [...prev, { data: reader.result as string, mimeType }]);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  return (
    <div className="animate-fadeIn">
      {/* 用户消息气泡 */}
      <div className="flex justify-end mb-2 group/msg items-start">
        {/* 编辑按钮 — 气泡左侧，hover 显示 */}
        {!isEditing && !isGenerating && onEdit && (
          <button
            onClick={handleStartEdit}
            className={`self-center mr-1 p-1 rounded-md opacity-0 group-hover/msg:opacity-100 transition-opacity flex-shrink-0 ${
              isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="编辑消息"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
        )}
        <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-tr-md px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm ${
          isDark ? 'bg-amber-900/30 text-amber-100' : 'bg-amber-50 text-amber-900'
        }`}>
          {isEditing ? (
            <div>
              <textarea
                ref={editRef}
                value={editText}
                onChange={e => {
                  setEditText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={handleEditKeyDown}
                onPaste={handleEditPaste}
                className={`w-full resize-none rounded-lg px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-1 ${
                  isDark
                    ? 'bg-[#1e1e1c] text-amber-100 focus:ring-amber-500/50 border border-amber-500/30'
                    : 'bg-white text-amber-900 focus:ring-amber-500/50 border border-amber-300'
                }`}
                style={{ minHeight: '36px' }}
              />
              {/* 参考图编辑区域 */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {editInputImages.map((img, idx) => (
                  <div key={idx} className="relative group/ref flex-shrink-0">
                    <img src={img.data} alt={`参考图 ${idx + 1}`} className="h-12 rounded-md object-cover" />
                    <button
                      onClick={() => setEditInputImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity"
                    >
                      <XMarkIcon className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => editFileInputRef.current?.click()}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  title="添加参考图"
                >
                  <PhotoIcon className="w-3.5 h-3.5" />
                  参考图
                </button>
                <input ref={editFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditImageUpload} />
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-1.5">
                <button
                  onClick={handleCancelEdit}
                  className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700/50' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmEdit}
                  disabled={!editText.trim()}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                    editText.trim()
                      ? (isDark ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-500 text-white hover:bg-amber-600')
                      : (isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400')
                  }`}
                >
                  <CheckIcon className="w-3 h-3" />
                  发送
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words">{item.prompt}</p>
              {/* img2img 输入图展示 */}
              {inputImgSrcs.length > 0 && (
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {inputImgSrcs.map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      alt={`参考图 ${idx + 1}`}
                      className="h-20 sm:h-24 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onPreview(src)}
                    />
                  ))}
                  <span className={`text-[10px] mt-0.5 block w-full ${isDark ? 'text-amber-400/50' : 'text-amber-600/50'}`}>参考图</span>
                </div>
              )}
              <div className={`flex items-center gap-2 mt-1 sm:mt-1.5 text-[10px] ${isDark ? 'text-amber-400/60' : 'text-amber-600/60'}`}>
                <span>{item.aspectRatio}</span>
                <span>{item.size}</span>
                {item.mode === 'img2img' && <span>图生图</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 优化后的提示词 */}
      {item.optimizedPrompt && item.optimizedPrompt !== item.prompt && (
        <div className="flex justify-start mb-2">
          <details className={`max-w-[90%] sm:max-w-[85%] rounded-xl px-3 py-2 text-[11px] sm:text-xs ${
            isDark ? 'bg-[#2a2a28] text-gray-400' : 'bg-gray-50 text-gray-500'
          }`}>
            <summary className="cursor-pointer select-none">AI 优化后的提示词</summary>
            <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{item.optimizedPrompt}</p>
          </details>
        </div>
      )}

      {/* 生成结果头部 — 模型 | 渠道 + 完成状态 */}
      <div className="flex justify-start mb-1.5">
        <div className="flex items-center gap-2">
          {isError ? (
            <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0">
              <svg viewBox="0 0 20 20" className="w-4 h-4 sm:w-5 sm:h-5" fill="none">
                <circle cx="10" cy="10" r="9" className={isDark ? 'fill-red-500/20' : 'fill-red-100'} />
                <path d="M7 7 L13 13 M13 7 L7 13" stroke={isDark ? '#ef4444' : '#dc2626'} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          ) : (
            <SuccessSparkle isDark={isDark} />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className={`font-medium ${isError ? (isDark ? 'text-red-400' : 'text-red-600') : (isDark ? 'text-amber-400' : 'text-amber-600')}`}>{modelName}</span>
              <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>|</span>
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>IkunCode</span>
            </div>
            <span className={`text-[11px] sm:text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {isError ? '生成失败' : '图片生成完成'}
              {!isError && (
                <span className={`ml-1.5 tabular-nums ${isDark ? 'text-amber-400/60' : 'text-amber-600/60'}`}>({elapsedStr})</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* AI 生成的图片 / 错误信息 */}
      <div className="flex justify-start mb-4">
        {isError ? (
          <div className={`max-w-[90%] sm:max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 ${
            isDark ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-200'
          }`}>
            <p className={`text-xs sm:text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>{item.error}</p>
          </div>
        ) : (
        <div className={`max-w-[90%] sm:max-w-[85%] rounded-2xl rounded-tl-md overflow-hidden shadow-lg ${
          isDark ? 'bg-[#2a2a28]' : 'bg-white'
        }`}>
          {imgSrc ? (
            <div className="relative group">
              <img
                src={imgSrc}
                alt={item.prompt}
                className="w-full max-h-[60vh] sm:max-h-[500px] object-contain cursor-pointer"
                loading="lazy"
                onClick={() => onPreview(imgSrc)}
              />
              <button
                onClick={handleDownload}
                className="absolute top-2 right-2 p-2 rounded-lg bg-black/50 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/70 active:bg-black/80"
                title="下载图片"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className={`w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
              加载中...
            </div>
          )}
          <div className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] flex items-center gap-1.5 sm:gap-2 ${
            isDark ? 'text-gray-500 border-t border-gray-700/30' : 'text-gray-400 border-t border-gray-100'
          }`}>
            <span>{modelName}</span>
            <span>·</span>
            <span>{item.mode === 'img2img' ? '图生图' : '文生图'}</span>
            <span>·</span>
            <span>{item.aspectRatio}</span>
            <span>·</span>
            <span>{item.size}</span>
            <span>·</span>
            <span>{elapsedStr}</span>
          </div>
        </div>
        )}
      </div>

      {/* 重新生成按钮 */}
      {!isGenerating && onRegenerate && (
        <div className="flex justify-start mb-4">
          <button
            onClick={() => onRegenerate(item.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors ${
              isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/40' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="重新生成"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            <span>重新生成</span>
          </button>
        </div>
      )}
    </div>
  );
};

/* ── 主组件 ────────────────────────────────── */

const ImageGallery: React.FC<ImageGalleryProps> = ({ theme, items, isGenerating, currentPrompt, currentInputImages, generatingStartTime, onEditItem, onRegenerateItem }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // ── 实时计时器（基于会话隔离的 startTime）
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
    if (isGenerating && generatingStartTime) {
      setElapsedTime(performance.now() - generatingStartTime);
      timerRef.current = window.setInterval(() => {
        setElapsedTime(performance.now() - generatingStartTime);
      }, 100);
    } else {
      setElapsedTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating, generatingStartTime]);

  // 自动滚动到底部
  const prevItemsRef = useRef(items);
  useEffect(() => {
    const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    // 切换会话（items 引用变化且内容不同）时延迟滚动，等图片占位渲染
    if (prevItemsRef.current !== items) {
      prevItemsRef.current = items;
      setTimeout(scrollToBottom, 50);
    } else {
      requestAnimationFrame(scrollToBottom);
    }
  }, [items, isGenerating]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="max-w-5xl mx-auto">
          {/* 空状态 */}
          {items.length === 0 && !isGenerating && (
            <div className="h-full flex flex-col items-center justify-center text-center pt-12 sm:pt-20">
              <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">🍌</div>
              <h2 className={`text-base sm:text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                开始创作
              </h2>
              <p className={`mt-1.5 sm:mt-2 text-xs sm:text-sm max-w-xs px-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                在下方输入提示词，选择风格和参数，即可生成图片
              </p>
              <div className={`mt-4 sm:mt-6 grid grid-cols-2 gap-1.5 sm:gap-2 text-[11px] sm:text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                <div className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg ${isDark ? 'bg-[#2a2a28]' : 'bg-gray-50'}`}>10 种宽高比</div>
                <div className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg ${isDark ? 'bg-[#2a2a28]' : 'bg-gray-50'}`}>1K / 2K / 4K</div>
                <div className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg ${isDark ? 'bg-[#2a2a28]' : 'bg-gray-50'}`}>8 种风格预设</div>
                <div className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg ${isDark ? 'bg-[#2a2a28]' : 'bg-gray-50'}`}>AI 提示词优化</div>
              </div>
            </div>
          )}

          {/* 图片列表 */}
          {items.map(item => (
            <GalleryCard key={item.id} item={item} theme={theme} onPreview={setPreviewSrc} onEdit={onEditItem} onRegenerate={onRegenerateItem} isGenerating={isGenerating} />
          ))}

          {/* 生成中状态 */}
          {isGenerating && (
            <div className="animate-fadeIn">
              {currentPrompt && (
                <div className="flex justify-end mb-2">
                  <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-tr-md px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm ${
                    isDark ? 'bg-amber-900/30 text-amber-100' : 'bg-amber-50 text-amber-900'
                  }`}>
                    {currentPrompt}
                    {currentInputImages && currentInputImages.length > 0 && (
                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        {currentInputImages.map((img, idx) => (
                          <img key={idx} src={img.data} alt={`参考图 ${idx + 1}`} className="h-20 sm:h-24 rounded-lg object-cover" />
                        ))}
                        <span className={`text-[10px] mt-0.5 block w-full ${isDark ? 'text-amber-400/50' : 'text-amber-600/50'}`}>参考图</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex justify-start mb-4">
                <div className={`rounded-2xl rounded-tl-md px-4 sm:px-6 py-4 sm:py-5 ${
                  isDark ? 'bg-[#2a2a28]' : 'bg-white shadow-sm'
                }`}>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
                      <svg viewBox="0 0 48 48" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="nb-banana-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="50%" stopColor="#f97316" />
                            <stop offset="100%" stopColor="#ef4444" />
                          </linearGradient>
                          <linearGradient id="nb-glow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
                            <stop offset="50%" stopColor="#f97316" stopOpacity="0" />
                            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.6" />
                          </linearGradient>
                        </defs>
                        <circle cx="24" cy="24" r="22" fill="none" stroke="url(#nb-glow-grad)" strokeWidth="1.5" strokeDasharray="8 6" className="animate-rotateGlow" />
                        <circle cx="24" cy="24" r="16" fill={isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.12)'} className="animate-breathe" />
                        <path d="M14 30 C14 24, 18 14, 24 14 C30 14, 34 18, 34 24 C34 28, 30 32, 26 30" fill="none" stroke="url(#nb-banana-grad)" strokeWidth="2.5" strokeLinecap="round" className="animate-drawBanana" />
                        <circle cx="18" cy="18" r="1.2" fill="#fbbf24" className="animate-sparkle" style={{ animationDelay: '0ms' }} />
                        <circle cx="32" cy="22" r="1" fill="#f97316" className="animate-sparkle" style={{ animationDelay: '400ms' }} />
                        <circle cx="22" cy="34" r="0.8" fill="#fbbf24" className="animate-sparkle" style={{ animationDelay: '800ms' }} />
                        <circle cx="30" cy="14" r="1" fill="#ef4444" className="animate-sparkle" style={{ animationDelay: '1200ms' }} />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs sm:text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        正在生成图片...
                      </span>
                      <span className={`text-[11px] sm:text-xs tabular-nums ${isDark ? 'text-amber-400/70' : 'text-amber-600/70'}`}>
                        {(elapsedTime / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 灯箱预览 */}
      <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />
    </>
  );
};

export default ImageGallery;
