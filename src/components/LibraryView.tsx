/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Notebook } from '../types/slate';
import { COVERS } from '../services/brushData';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { READY_MADE_PAPERS, SIZES } from '../utils/paperTemplates';
import { detectDevice, ViewportState } from '../utils/layout';

interface LibraryViewProps {
  notebooks: Notebook[];
  onCreateNotebook: (title: string, coverIndex: number, template: string) => void;
  onOpenNotebook: (id: number) => void;
  onDeleteNotebook?: (id: number) => void;
  onRestoreNotebook?: (id: number) => void;
  onPermanentDelete?: (id: number) => void;
  onToggleFavorite?: (id: number) => void;
  onToggleTrash?: (id: number) => void;
  onEmptyTrash: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenPermissions: () => void;
  onOpenDataManagement: () => void;
  onOpenGallery: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  notebooks,
  onCreateNotebook,
  onOpenNotebook,
  onDeleteNotebook,
  onRestoreNotebook,
  onPermanentDelete,
  onToggleFavorite,
  onToggleTrash,
  onEmptyTrash,
  onOpenPrivacyPolicy,
  onOpenPermissions,
  onOpenDataManagement,
  onOpenGallery,
}) => {
  const [filter, setFilter] = useState<'all' | 'fav' | 'trash'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedCover, setSelectedCover] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('lined');

  // Auto-Responsive Device Layout (Phone / Tablet / PC, Landscape / Portrait)
  const [viewport, setViewport] = useState<ViewportState>(() =>
    typeof window !== 'undefined'
      ? detectDevice(window.innerWidth, window.innerHeight, 'ontouchstart' in window)
      : { width: 1024, height: 768, deviceType: 'desktop', orientation: 'landscape', isTouch: false }
  );

  useEffect(() => {
    const handleResize = () => {
      setViewport(detectDevice(window.innerWidth, window.innerHeight, 'ontouchstart' in window));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isPhonePortrait = viewport.deviceType === 'phone' && viewport.orientation === 'portrait';
  const isPhoneLandscape = viewport.deviceType === 'phone' && viewport.orientation === 'landscape';
  const isTablet = viewport.deviceType === 'tablet';

  const filteredNotebooks = notebooks
    .filter((nb) => {
      const isTrash = Boolean(nb.del || nb.inTrash);
      if (filter === 'trash') return isTrash;
      if (isTrash) return false;
      if (filter === 'fav') return Boolean(nb.fav || nb.isFav);
      return true;
    })
    .filter((nb) => {
      if (!searchQuery.trim()) return true;
      return (nb.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => (b.upd || 0) - (a.upd || 0));

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateNotebook(newTitle.trim() || 'Untitled', selectedCover, selectedTemplate);
    setNewTitle('');
    setShowNewModal(false);
  };

  return (
    <div
      id="lib"
      className={`h-full w-full select-none flex ${
        isPhonePortrait ? 'flex-col' : isPhoneLandscape ? 'flex-col' : 'flex-col md:flex-row'
      }`}
      style={{ backgroundColor: 'var(--bg)', color: 'var(--tx)' }}
    >
      {/* Auto-rearranged Navigation */}
      {/* On Phone Portrait: Compact Top Bar + Bottom Action Strip */}
      {/* On Phone Landscape: Ultra-slim Single-Row Header */}
      {/* On Tablet / PC: Sidebar or Top Bar with full controls */}
      <nav
        id="nav"
        className={`flex-none border-b md:border-b-0 md:border-r flex items-center justify-between ${
          isPhonePortrait
            ? 'p-2.5 flex-col gap-2'
            : isPhoneLandscape
            ? 'p-2 px-3 flex-row gap-3 overflow-x-auto'
            : 'w-full md:w-56 p-4 md:p-5 md:flex-col flex-row gap-2'
        }`}
        style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)' }}
      >
        {/* Brand & Tabs */}
        <div className={`flex items-center gap-3 ${isPhonePortrait ? 'w-full justify-between' : ''}`}>
          <div className="flex items-center gap-1.5 flex-none">
            <span className="text-xl">📓</span>
            <b className="text-lg md:text-xl font-black tracking-tight" style={{ color: 'var(--ac)' }}>
              SLATE
            </b>
            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
              {viewport.deviceType === 'phone' ? (viewport.orientation === 'landscape' ? '📱 ⤹' : '📱') : viewport.deviceType === 'tablet' ? '📟' : '🖥️'}
            </span>
          </div>

          {/* Folder tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border-0 transition ${
                filter === 'all' ? 'on font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={filter === 'all' ? { backgroundColor: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : {}}
            >
              Docs
            </button>
            <button
              onClick={() => setFilter('fav')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border-0 transition flex items-center gap-1 ${
                filter === 'fav' ? 'on font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={filter === 'fav' ? { backgroundColor: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : {}}
            >
              <span className="text-amber-500 font-bold">★</span>
              <span>Favs</span>
            </button>
            <button
              onClick={() => setFilter('trash')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border-0 transition ${
                filter === 'trash' ? 'on font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={filter === 'trash' ? { backgroundColor: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : {}}
            >
              Trash
            </button>
          </div>
        </div>

        {/* Clean Tools (Titles & concise info, no unnecessary text) */}
        <div
          className={`flex items-center gap-1 ${
            isPhonePortrait ? 'w-full justify-around pt-1 border-t' : isPhoneLandscape ? 'ml-auto' : 'md:flex-col md:w-full md:items-stretch md:mt-4 md:pt-4 md:border-t'
          }`}
          style={{ borderColor: 'var(--bd)' }}
        >
          <button
            onClick={onOpenGallery}
            className="px-2.5 py-1.5 rounded-lg text-xs border-0 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5"
            title="Media Vault"
          >
            <span>🗄️</span>
            <span className={isPhonePortrait || isPhoneLandscape ? 'text-[11px]' : ''}>Vault</span>
          </button>

          <button
            onClick={onOpenPermissions}
            className="px-2.5 py-1.5 rounded-lg text-xs border-0 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5"
            title="Permissions"
          >
            <span>🛡️</span>
            <span className={isPhonePortrait || isPhoneLandscape ? 'text-[11px]' : ''}>Safety</span>
          </button>

          <button
            onClick={onOpenDataManagement}
            className="px-2.5 py-1.5 rounded-lg text-xs border-0 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5"
            title="Backup"
          >
            <span>📦</span>
            <span className={isPhonePortrait || isPhoneLandscape ? 'text-[11px]' : ''}>Backup</span>
          </button>

          <button
            onClick={onOpenPrivacyPolicy}
            className="px-2.5 py-1.5 rounded-lg text-xs border-0 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5"
            title="Privacy"
          >
            <span>📜</span>
            <span className={isPhonePortrait || isPhoneLandscape ? 'text-[11px]' : ''}>Privacy</span>
          </button>
        </div>

        {/* PWA Install Button when available */}
        <div className="hidden md:flex mt-auto pt-3 border-t flex-col gap-1.5" style={{ borderColor: 'var(--bd)' }}>
          <PWAInstallPrompt />
        </div>
      </nav>

      {/* Main Grid View */}
      <div
        id="libm"
        className={`flex-1 overflow-y-auto ${
          isPhonePortrait ? 'p-3' : isPhoneLandscape ? 'p-3' : 'p-4 md:p-6'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h1 id="lh" className="text-xl md:text-2xl font-bold tracking-tight">
              {filter === 'all' ? 'Documents' : filter === 'fav' ? 'Favorites' : 'Trash'}
            </h1>
            <span className="text-xs text-gray-400">({filteredNotebooks.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {filter === 'trash' && filteredNotebooks.length > 0 && (
              <button
                onClick={onEmptyTrash}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg text-red-600 border border-red-300 dark:border-red-900/60"
              >
                Empty Trash
              </button>
            )}

            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-lg w-28 sm:w-44 border"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--sf)' }}
              aria-label="Search notebooks"
            />
          </div>
        </div>

        {/* Notebooks Grid: Auto-arranged column count depending on device & orientation */}
        <div
          id="docs"
          className={`grid gap-3 sm:gap-4 ${
            isPhonePortrait
              ? 'grid-cols-2'
              : isPhoneLandscape
              ? 'grid-cols-3 sm:grid-cols-4'
              : isTablet
              ? 'grid-cols-3 lg:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
          }`}
        >
          {/* New Notebook Card */}
          {filter !== 'trash' && (
            <button
              onClick={() => setShowNewModal(true)}
              className="group border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center min-h-[170px] sm:min-h-[210px] cursor-pointer transition hover:border-blue-500 hover:scale-[1.01]"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'transparent' }}
              aria-label="Create new notebook"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold text-white mb-2 shadow-sm transition group-hover:scale-110"
                style={{ backgroundColor: 'var(--ac)' }}
              >
                +
              </div>
              <span className="text-xs font-bold">New Notebook</span>
            </button>
          )}

          {/* Notebook Cards */}
          {filteredNotebooks.map((nb) => {
            const cover = COVERS[nb.cv || 0] || COVERS[0];
            const strokeCount = (nb.pages || []).reduce((acc, p) => acc + (p.strokes?.length || 0), 0);

            return (
              <div
                key={nb.id}
                className="group relative flex flex-col rounded-xl p-2.5 cursor-pointer transition hover:scale-[1.01] border shadow-xs"
                style={{
                  backgroundColor: 'var(--sf)',
                  borderColor: 'var(--bd)',
                }}
                onClick={() => onOpenNotebook(nb.id)}
                role="button"
                tabIndex={0}
                aria-label={`Open notebook ${nb.name}`}
              >
                {/* Visual Cover */}
                <div
                  className="w-full aspect-3/4 rounded-lg relative overflow-hidden shadow-sm flex flex-col justify-between p-2.5 select-none"
                  style={{
                    backgroundColor: cover.bg,
                    color: cover.tc,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base">📓</span>
                    <span className="text-[10px] font-mono opacity-70">
                      {strokeCount} strokes
                    </span>
                  </div>

                  <div className="my-auto py-2">
                    <div className="font-bold text-xs sm:text-sm line-clamp-2 leading-tight">
                      {nb.name}
                    </div>
                  </div>

                  <div className="text-[10px] opacity-70">
                    {nb.pages?.length || 1} {nb.pages?.length === 1 ? 'page' : 'pages'}
                  </div>
                </div>

                {/* Card Title & Quick Actions */}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <div className="font-semibold truncate flex-1 mr-1" title={nb.name}>
                    {nb.name}
                  </div>

                  <div className="flex items-center gap-0.5 flex-none" onClick={(e) => e.stopPropagation()}>
                    {filter === 'trash' ? (
                      <>
                        <button
                          onClick={() => (onRestoreNotebook ? onRestoreNotebook(nb.id) : onToggleTrash?.(nb.id))}
                          title="Restore"
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[11px] border-0"
                        >
                          ↩️
                        </button>
                        <button
                          onClick={() => (onPermanentDelete ? onPermanentDelete(nb.id) : onToggleTrash?.(nb.id))}
                          title="Delete"
                          className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-[11px] border-0"
                        >
                          🗑️
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => onToggleFavorite?.(nb.id)}
                          title={nb.fav || nb.isFav ? 'Unfavorite' : 'Favorite'}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-xs border-0"
                        >
                          <span className={nb.fav || nb.isFav ? 'text-amber-500 font-bold' : 'text-gray-300'}>★</span>
                        </button>
                        <button
                          onClick={() => (onDeleteNotebook ? onDeleteNotebook(nb.id) : onToggleTrash?.(nb.id))}
                          title="Move to trash"
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 text-xs border-0"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Notebook Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm flex flex-col rounded-2xl p-5 shadow-2xl"
            style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--bd)' }}>
              <h3 className="font-bold text-sm">New Notebook</h3>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600 border-0">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="pt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Title</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Notebook title..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border"
                  style={{ borderColor: 'var(--bd)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Cover Style</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {COVERS.slice(0, 8).map((c, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedCover(idx)}
                      className={`h-10 rounded-lg border transition ${selectedCover === idx ? 'ring-2 ring-blue-500' : ''}`}
                      style={{ backgroundColor: c.bg, borderColor: 'var(--bd)' }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Paper</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full text-xs p-1.5 rounded-lg border"
                  style={{ borderColor: 'var(--bd)' }}
                >
                  {READY_MADE_PAPERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t flex justify-end gap-2" style={{ borderColor: 'var(--bd)' }}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border"
                  style={{ borderColor: 'var(--bd)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white"
                  style={{ backgroundColor: 'var(--ac)' }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
