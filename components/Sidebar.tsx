// components/Sidebar.tsx — 左侧边栏（品牌 + 新建对话 + 对话列表）

import React, { useState, useCallback } from 'react';
import type { Theme, Conversation } from '../types';
import { PlusIcon, TrashIcon, CogIcon } from './Icons';
import Modal from './Modal';

interface SidebarProps {
  theme: Theme;
  isOpen: boolean;
  conversations: Conversation[];
  activeConvId: string | null;
  generatingConvIds: Set<string>;
  onClose: () => void;
  onSelectConv: (id: string) => void;
  onDeleteConv: (id: string) => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
}

/* ── 时间格式化 ────────────────────────────────── */

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return '昨天';
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/* ── 对话条目 ──────────────────────────────────── */

const ConversationItem: React.FC<{
  conv: Conversation;
  isActive: boolean;
  isGenerating: boolean;
  theme: Theme;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ conv, isActive, isGenerating: convGenerating, theme, onSelect, onDelete }) => {
  const isDark = theme === 'dark';
  const count = conv.items.length;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? (isDark ? 'bg-amber-900/20' : 'bg-amber-50')
          : (isDark ? 'hover:bg-[#2e2e2c]' : 'hover:bg-gray-100')
      }`}
      onClick={() => onSelect(conv.id)}
    >
      {/* 生成中指示器 */}
      {convGenerating && (
        <span className={`flex-shrink-0 w-2 h-2 rounded-full animate-pulse ${isDark ? 'bg-amber-400' : 'bg-amber-500'}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${
          isActive
            ? (isDark ? 'text-amber-300 font-medium' : 'text-amber-700 font-medium')
            : (isDark ? 'text-gray-300' : 'text-gray-700')
        }`}>
          {conv.title}
        </p>
        <p className={`text-[10px] mt-0.5 truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {convGenerating ? '生成中...' : (count > 0 ? `${count} 张图片 · ` : '')}{!convGenerating && formatTime(conv.updatedAt)}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
        className={`flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
          isDark ? 'hover:bg-[#3a3a38] text-gray-500 hover:text-red-400' : 'hover:bg-gray-200 text-gray-400 hover:text-red-500'
        }`}
        title="删除对话"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/* ── Sidebar 主体 ──────────────────────────────── */

const Sidebar: React.FC<SidebarProps> = ({
  theme, isOpen, conversations, activeConvId, generatingConvIds,
  onClose, onSelectConv, onDeleteConv, onClearAll, onOpenSettings, onNewChat,
}) => {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const isDark = theme === 'dark';
  const sortedConvs = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) onDeleteConv(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, onDeleteConv]);

  return (
    <>
      {/* 移动端遮罩 */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed md:relative z-40 md:z-auto top-0 left-0 h-full w-[260px] flex flex-col flex-shrink-0 border-r transition-transform duration-300 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isDark ? 'bg-[#1a1a18] border-gray-700/40' : 'bg-white border-gray-200'
        }`}
      >
        {/* 品牌头部 */}
        <div className={`flex items-center justify-between px-4 h-14 border-b ${
          isDark ? 'border-gray-700/40' : 'border-gray-100'
        }`}>
          <a href="https://api.ikuncode.cc/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
            <img src="/logo.jpeg" alt="IkunImage" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            <div>
              <h1 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500 leading-tight group-hover:from-amber-400 group-hover:to-orange-400 transition-all">
                IkunImage
              </h1>
              <span className={`text-[11px] leading-tight group-hover:underline ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                由 IKunCode 官方开发
              </span>
            </div>
          </a>
          <button
            onClick={onOpenSettings}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'hover:bg-[#2e2e2c] text-gray-500' : 'hover:bg-gray-100 text-gray-400'
            }`}
            title="设置"
          >
            <CogIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* 新建对话 */}
        <div className="px-3 pt-3">
          <button
            onClick={onNewChat}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
              isDark
                ? 'bg-[#2e2e2c] text-gray-300 hover:bg-[#3a3a38] active:bg-[#444442]'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 active:bg-gray-200'
            }`}
          >
            <PlusIcon className="w-4 h-4" />
            新建对话
          </button>
        </div>

        {/* 对话列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <span className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              对话 · {conversations.length} 个
            </span>
            {conversations.length > 0 && (
              <button
                onClick={onClearAll}
                className={`p-1 rounded transition-colors ${
                  isDark ? 'text-gray-600 hover:text-red-400 hover:bg-[#2e2e2c]' : 'text-gray-300 hover:text-red-500 hover:bg-gray-100'
                }`}
                title="清空所有对话"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="px-1.5 pb-3">
            {sortedConvs.length === 0 ? (
              <div className={`px-3 py-8 text-center text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
                暂无对话记录
              </div>
            ) : (
              sortedConvs.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConvId}
                  isGenerating={generatingConvIds.has(conv.id)}
                  theme={theme}
                  onSelect={onSelectConv}
                  onDelete={setDeleteTarget}
                />
              ))
            )}
          </div>
        </div>

        {/* 底部关闭（移动端） */}
        <div className={`md:hidden flex items-center justify-center px-4 py-3 border-t ${
          isDark ? 'border-gray-700/40' : 'border-gray-100'
        }`}>
          <button
            onClick={onClose}
            className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${
              isDark ? 'bg-[#2e2e2c] text-gray-300 hover:bg-[#3a3a38]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            关闭侧边栏
          </button>
        </div>
      </aside>

      {/* 删除对话确认 */}
      <Modal
        open={!!deleteTarget}
        theme={theme}
        config={{
          title: '删除对话',
          message: '确定要删除这个对话及其所有图片吗？',
          variant: 'warning',
          onConfirm: confirmDelete,
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
};

export default Sidebar;
