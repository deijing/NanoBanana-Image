// components/HistoryPanel.tsx — 历史记录侧滑面板

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Theme, GalleryItem } from '../types';
import { IMAGE_MODELS } from '../constants';
import { loadImage } from '../services/imageStore';
import { XMarkIcon, ArrowDownTrayIcon, TrashIcon, MagnifyingGlassIcon } from './Icons';

interface HistoryPanelProps {
  isOpen: boolean;
  theme: Theme;
  items: GalleryItem[];
  onClose: () => void;
  onDeleteItem: (id: string) => void;
}

// ── 缩略图卡片 ─────────────────────────────────

const HistoryCard: React.FC<{
  item: GalleryItem;
  theme: Theme;
  onView: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
}> = ({ item, theme, onView, onDelete }) => {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (item.imageRef) loadImage(item.imageRef).then(src => setThumbSrc(src));
  }, [item.imageRef]);

  const modelName = IMAGE_MODELS.find(m => m.id === item.model)?.name || 'NanoBanana Pro';
  const timeStr = new Date(item.timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const promptSummary = item.prompt.length > 40
    ? item.prompt.slice(0, 40) + '...'
    : item.prompt;

  return (
    <div className={`rounded-xl overflow-hidden transition-all hover:scale-[1.02] ${
      isDark ? 'bg-[#2a2a28] hover:bg-[#333]' : 'bg-white shadow-sm hover:shadow-md'
    }`}>
      <div className="relative aspect-square cursor-pointer group" onClick={() => onView(item)}>
        {thumbSrc ? (
          <img src={thumbSrc} alt={item.prompt} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center animate-shimmer ${
            isDark ? 'bg-[#333]' : 'bg-gray-100'
          }`}>
            <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>...</span>
          </div>
        )}
        {/* 悬浮操作层 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={e => { e.stopPropagation(); onView(item); }}
            className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
            title="查看大图"
          >
            <MagnifyingGlassIcon className="w-4 h-4" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            className="p-1.5 rounded-lg bg-red-500/60 backdrop-blur-sm text-white hover:bg-red-500/80 transition-colors"
            title="删除"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2">
        <p className={`text-[11px] sm:text-xs leading-snug line-clamp-2 ${
          isDark ? 'text-gray-300' : 'text-gray-700'
        }`}>
          {promptSummary}
        </p>
        <div className={`flex items-center gap-1.5 mt-1.5 text-[10px] ${
          isDark ? 'text-gray-500' : 'text-gray-400'
        }`}>
          <span>{modelName}</span>
          <span>·</span>
          <span>{timeStr}</span>
        </div>
      </div>
    </div>
  );
};

// ── 大图预览 Modal ──────────────────────────────

const ImagePreviewModal: React.FC<{
  item: GalleryItem | null;
  theme: Theme;
  onClose: () => void;
}> = ({ item, theme, onClose }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (item?.imageRef) {
      loadImage(item.imageRef).then(src => setImgSrc(src));
    } else {
      setImgSrc(null);
    }
  }, [item]);

  const handleDownload = useCallback(() => {
    if (!imgSrc || !item) return;
    const a = document.createElement('a');
    a.href = imgSrc;
    const ext = imgSrc.startsWith('data:image/png') ? 'png' : 'jpg';
    a.download = `nanoBanana_${item.id}.${ext}`;
    a.click();
  }, [imgSrc, item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[85vh] animate-fadeIn" onClick={e => e.stopPropagation()}>
        {imgSrc ? (
          <img src={imgSrc} alt={item.prompt} className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center bg-gray-800 rounded-xl">
            <span className="text-gray-400 text-sm">加载中...</span>
          </div>
        )}
        {/* 操作按钮 */}
        <div className="absolute top-3 right-3 flex gap-2">
          <button onClick={handleDownload} className="p-2 rounded-xl bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm" title="下载">
            <ArrowDownTrayIcon className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-2 rounded-xl bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm" title="关闭">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {/* Prompt 信息 */}
        <div className="absolute bottom-0 left-0 right-0 p-3 rounded-b-xl bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white text-xs leading-relaxed line-clamp-3">{item.prompt}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-white/60">
            <span>{IMAGE_MODELS.find(m => m.id === item.model)?.name}</span>
            <span>·</span>
            <span>{item.aspectRatio} · {item.size}</span>
            <span>·</span>
            <span>{(item.elapsed / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 历史记录面板主体 ────────────────────────────

const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, theme, items, onClose, onDeleteItem }) => {
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const sortedItems = [...items].reverse();

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewItem) {
          setPreviewItem(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, previewItem, onClose]);

  // 锁定 body 滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定要删除这条记录吗？')) {
      onDeleteItem(id);
      if (previewItem?.id === id) setPreviewItem(null);
    }
  }, [onDeleteItem, previewItem]);

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* 侧滑面板 */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 md:w-[28rem] flex flex-col shadow-2xl ${
          isDark ? 'bg-[#1a1a1a]' : 'bg-gray-50'
        }`}
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        {/* 面板头部 */}
        <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
          isDark ? 'border-gray-700/50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-base">🕐</span>
            <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>历史记录</h2>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
            }`}>
              {items.filter(it => !it.error).length}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-[#3a3a38] text-gray-400' : 'hover:bg-gray-200 text-gray-500'
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
          {sortedItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="text-4xl mb-3">🍌</span>
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>还没有生成记录</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>生成的图片会自动保存在这里</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sortedItems.map(item => (
                <HistoryCard key={item.id} item={item} theme={theme} onView={setPreviewItem} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 大图预览 */}
      <ImagePreviewModal item={previewItem} theme={theme} onClose={() => setPreviewItem(null)} />
    </>
  );
};

export default HistoryPanel;
