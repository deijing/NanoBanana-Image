// components/HistoryGallery.tsx — 全部历史图片网格画廊

import React, { useState, useEffect, useCallback } from 'react';
import type { Theme, GalleryItem, Conversation } from '../types';
import { IMAGE_MODELS } from '../constants';
import { loadImage } from '../services/imageStore';
import { XMarkIcon, ArrowDownTrayIcon } from './Icons';

/* ── 缩略图卡片 ───────────────────────────────── */

const Thumbnail: React.FC<{
  item: GalleryItem;
  isDark: boolean;
  onClick: (src: string) => void;
}> = ({ item, isDark, onClick }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (item.imageRef) loadImage(item.imageRef).then(setSrc);
  }, [item.imageRef]);

  // 跳过错误记录，不在历史画廊中展示
  if (item.error) return null;

  const modelName = IMAGE_MODELS.find(m => m.id === item.model)?.name || 'NanoBanana Pro';
  const elapsedStr = item.elapsed < 1000 ? `${item.elapsed}ms` : `${(item.elapsed / 1000).toFixed(1)}s`;

  return (
    <div
      onClick={() => src && onClick(src)}
      className={`group relative rounded-xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98] ${
        isDark ? 'bg-[#2a2a28]' : 'bg-gray-100'
      }`}
    >
      {src ? (
        <img src={src} alt={item.prompt} className="w-full aspect-square object-cover" loading="lazy" />
      ) : (
        <div className={`w-full aspect-square flex items-center justify-center text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
          加载中...
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
        <p className="text-white text-[10px] leading-tight line-clamp-2">{item.prompt}</p>
        <div className="flex items-center gap-1 mt-1 text-[9px] text-white/60">
          <span>{modelName}</span>
          <span>·</span>
          <span>{elapsedStr}</span>
        </div>
      </div>
    </div>
  );
};

/* ── 内置灯箱 ──────────────────────────────────── */

const Lightbox: React.FC<{ src: string | null; onClose: () => void }> = ({ src, onClose }) => {
  useEffect(() => {
    if (!src) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [src, onClose]);

  if (!src) return null;

  const download = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `nanoBanana_${Date.now()}.${src.startsWith('data:image/png') ? 'png' : 'jpg'}`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md" onClick={onClose}>
      <img
        src={src}
        alt="预览"
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-modalIn"
        onClick={e => e.stopPropagation()}
      />
      <div className="absolute top-4 right-4 flex gap-2">
        <button onClick={e => { e.stopPropagation(); download(); }} className="p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm" title="下载">
          <ArrowDownTrayIcon className="w-5 h-5" />
        </button>
        <button onClick={e => { e.stopPropagation(); onClose(); }} className="p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm" title="关闭">
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/* ── HistoryGallery 主体 ──────────────────────── */

interface HistoryGalleryProps {
  open: boolean;
  theme: Theme;
  conversations: Conversation[];
  onClose: () => void;
}

const HistoryGallery: React.FC<HistoryGalleryProps> = ({ open, theme, conversations, onClose }) => {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const isDark = theme === 'dark';

  // ESC 关闭
  useEffect(() => {
    if (!open || previewSrc) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, previewSrc, onClose]);

  if (!open) return null;

  const allItems = conversations
    .flatMap(c => c.items)
    .filter(it => !it.error)
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col animate-modalIn">
      {/* 背景 */}
      <div className={`absolute inset-0 ${isDark ? 'bg-[#1a1a18]/95' : 'bg-white/95'} backdrop-blur-xl`} />

      {/* Header */}
      <div className={`relative flex items-center justify-between px-4 sm:px-6 h-14 border-b flex-shrink-0 ${
        isDark ? 'border-gray-700/40' : 'border-gray-200'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🖼️</span>
          <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            历史图片
          </h2>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
            {allItems.length} 张
          </span>
        </div>
        <button
          onClick={onClose}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'hover:bg-[#3a3a38] text-gray-400' : 'hover:bg-gray-100 text-gray-500'
          }`}
          title="关闭"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Grid */}
      <div className="relative flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
        {allItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>暂无生成记录</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {allItems.map(item => (
              <Thumbnail key={item.id} item={item} isDark={isDark} onClick={setPreviewSrc} />
            ))}
          </div>
        )}
      </div>

      {/* 灯箱 */}
      <Lightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />
    </div>
  );
};

export default HistoryGallery;
