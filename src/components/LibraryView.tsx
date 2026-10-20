/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Notebook } from '../types/slate';
import { COVERS } from '../services/brushData';
import { PWAInstallPrompt } from './PWAInstallPrompt';

interface LibraryViewProps {
  notebooks: Notebook[];
  onOpenNotebook: (nb: Notebook) => void;
  onCreateNotebook: (name: string, cover: string, template: string) => void;
  onToggleFavorite: (id: number) => void;
  onToggleTrash: (id: number) => void;
  onEmptyTrash: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenPermissions: () => void;
  onOpenGallery: () => void;
  onOpenDataManagement: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  notebooks,
  onOpenNotebook,
  onCreateNotebook,
  onToggleFavorite,
  onToggleTrash,
  onEmptyTrash,
  onOpenPrivacyPolicy,
  onOpenPermissions,
  onOpenGallery,
  onOpenDataManagement,
}) => {
  const [filter, setFilter] = useState<'all' | 'fav' | 'trash'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedCover, setSelectedCover] = useState(COVERS[0]);
  const [selectedTemplate, setSelectedTemplate] = useState('lined');

  const filteredNotebooks = notebooks
    .filter((n) => {
      const matchesSearch = (n.name || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (filter === 'trash') return !!n.del;
      if (n.del) return false;
      if (filter === 'fav') return !!n.fav;
      return true;
    })
    .sort((a, b) => (b.upd || 0) - (a.upd || 0));

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateNotebook(newTitle.trim() || 'Untitled', selectedCover, selectedTemplate);
    setNewTitle('');
    setShowNewModal(false);
  };

  return (
    <div id="lib" className="flex flex-col md:flex-row h-full w-full select-none" style={{ backgroundColor: 'var(--bg)', color: 'var(--tx)' }}>
      {/* Navigation: Responsive Top Bar on Mobile, Sidebar on Desktop */}
      <nav
        id="nav"
        className="w-full md:w-56 flex-none p-3 md:p-5 border-b md:border-b-0 md:border-r flex md:flex-col flex-row items-center md:items-stretch overflow-x-auto gap-2 md:gap-1.5 shadow-sm md:shadow-none"
        style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)' }}
      >
        <div className="flex items-center justify-between md:mb-4 px-1 md:px-2 flex-none">
          <div className="flex items-center gap-1.5">
            <span className="text-xl">📓</span>
            <b className="text-xl md:text-2xl font-black tracking-tight" style={{ color: 'var(--ac)' }}>
              SLATE
            </b>
          </div>
          <span className="hidden md:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-500">
            v1.0
          </span>
        </div>

        {/* View Folders */}
        <div className="flex md:flex-col flex-row items-center md:items-stretch gap-1.5 flex-none">
          <a
            onClick={() => setFilter('all')}
            className={`cursor-pointer px-2.5 md:px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium transition whitespace-nowrap ${
              filter === 'all' ? 'on font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
            style={filter === 'all' ? { backgroundColor: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : {}}
          >
            📚 Documents
          </a>

          <a
            onClick={() => setFilter('fav')}
            className={`cursor-pointer px-2.5 md:px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              filter === 'fav' ? 'on font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
            style={filter === 'fav' ? { backgroundColor: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : {}}
          >
            <span className="text-amber-500 font-bold">★</span>
            <span>Favorites</span>
          </a>

          <a
            onClick={() => setFilter('trash')}
            className={`cursor-pointer px-2.5 md:px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium transition whitespace-nowrap ${
              filter === 'trash' ? 'on font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
            style={filter === 'trash' ? { backgroundColor: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : {}}
          >
            🗑 Trash
          </a>
        </div>

        <div className="hidden md:block my-2 border-t" style={{ borderColor: 'var(--bd)' }} />

        {/* Store & Safety Tools */}
        <div className="hidden md:block text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">
          Store &amp; Media Vault
        </div>

        <div className="flex md:flex-col flex-row items-center md:items-stretch gap-1 flex-none ml-auto md:ml-0">
          <button
            onClick={onOpenGallery}
            className="text-left px-2 md:px-3 py-1.5 rounded-xl text-xs hover:bg-gray-100 dark:hover:bg-gray-800/50 flex items-center gap-1.5 whitespace-nowrap"
            title="Open Media Vault"
          >
            <span>🗄️</span>
            <span className="hidden sm:inline">Media Vault</span>
          </button>

          <button
            onClick={onOpenPermissions}
            className="text-left px-2 md:px-3 py-1.5 rounded-xl text-xs hover:bg-gray-100 dark:hover:bg-gray-800/50 flex items-center gap-1.5 whitespace-nowrap"
            title="Permissions & Data Safety"
          >
            <span>🛡️</span>
            <span className="hidden sm:inline">Safety</span>
          </button>

          <button
            onClick={onOpenDataManagement}
            className="text-left px-2 md:px-3 py-1.5 rounded-xl text-xs hover:bg-gray-100 dark:hover:bg-gray-800/50 flex items-center gap-1.5 whitespace-nowrap"
            title="Backup & Data Erasure"
          >
            <span>📦</span>
            <span className="hidden sm:inline">Backup</span>
          </button>

          <button
            onClick={onOpenPrivacyPolicy}
            className="text-left px-2 md:px-3 py-1.5 rounded-xl text-xs hover:bg-gray-100 dark:hover:bg-gray-800/50 flex items-center gap-1.5 whitespace-nowrap"
            title="Privacy Policy"
          >
            <span>📜</span>
            <span className="hidden sm:inline">Privacy</span>
          </button>
        </div>

        {/* In-App PWA Install Widget on Desktop */}
        <div className="hidden md:flex mt-auto pt-3 border-t flex-col gap-2" style={{ borderColor: 'var(--bd)' }}>
          <PWAInstallPrompt />
          <div className="text-[10px] text-gray-400 px-1 text-center">
            Zero Telemetry • 100% On-Device
          </div>
        </div>
      </nav>

      {/* Main Grid View */}
      <div id="libm" className="flex-1 overflow-y-auto p-4 md:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 id="lh" className="text-3xl font-extrabold tracking-tight">
            {filter === 'all' ? 'Documents' : filter === 'fav' ? 'Favorites' : 'Trash'}
          </h1>

          {filter === 'trash' && (
            <button
              onClick={onEmptyTrash}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl text-red-600 border border-red-300 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              Empty trash
            </button>
          )}

          <input
            id="find"
            type="text"
            placeholder="Search notebooks..."
            aria-label="Search notebooks"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 text-sm px-3 py-2 rounded-xl border focus:outline-none focus:border-blue-500 shadow-sm"
            style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)', color: 'var(--tx)' }}
          />
        </div>

        {/* Notebook Cards Grid */}
        <div id="grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {/* New Notebook Button Card */}
          {filter !== 'trash' && (
            <div
              onClick={() => setShowNewModal(true)}
              className="new aspect-[3/4] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition hover:border-blue-500 hover:scale-[1.02] shadow-sm"
              style={{ borderColor: 'var(--bd)', color: 'var(--ac)' }}
              title="Create new notebook"
              role="button"
              aria-label="Create new notebook"
            >
              <span className="text-4xl font-light mb-1">+</span>
              <span className="text-xs font-semibold">New Notebook</span>
            </div>
          )}

          {/* Notebook Cards */}
          {filteredNotebooks.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.del) onOpenNotebook(n);
              }}
              className="card flex flex-col cursor-pointer group"
              role="button"
              aria-label={`Open notebook ${n.name}`}
            >
              {/* 3D Notebook Cover */}
              <div
                className="cv relative aspect-[3/4] rounded-r-xl rounded-l-sm shadow-md overflow-hidden transition transform group-hover:-translate-y-1"
                style={{ ['--c' as any]: n.cover }}
              >
                {/* Embedded Page Preview Canvas */}
                <div className="absolute inset-y-[8%] inset-x-[12%] bg-white rounded-sm shadow overflow-hidden flex flex-col p-2 text-[9px] text-gray-400 select-none">
                  <div className="font-bold truncate text-gray-700">{n.name}</div>
                  <div className="flex-1 mt-1 border-t border-dashed border-gray-200">
                    {n.pages[0]?.strokes?.length ? (
                      <div className="h-full flex items-center justify-center text-[10px] text-gray-300">
                        {n.pages[0].strokes.length} strokes
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[10px] text-gray-300 italic">
                        Empty page
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Title and Subtitle Info */}
              <div className="nm mt-2.5 font-bold text-sm truncate" title={n.name}>
                {n.name || 'Untitled'}
              </div>

              <div className="sub flex items-center justify-between text-xs text-gray-400 mt-0.5">
                <span>
                  {n.pages.length} page{n.pages.length > 1 ? 's' : ''}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(n.id);
                    }}
                    className="p-1 text-sm leading-none border-0 bg-transparent flex items-center justify-center hover:scale-110 transition"
                    title={n.fav ? 'Remove from favorites' : 'Mark as favorite'}
                    aria-label="Toggle favorite"
                  >
                    <svg className="w-4 h-4" fill={n.fav ? '#f59e0b' : 'none'} stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTrash(n.id);
                    }}
                    className="text-[11px] px-1.5 py-0.5 rounded border"
                    style={{ borderColor: 'var(--bd)' }}
                    title={n.del ? 'Restore notebook' : 'Delete notebook'}
                    aria-label={n.del ? 'Restore' : 'Delete'}
                  >
                    {n.del ? 'Restore' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Notebook Modal */}
      {showNewModal && (
        <div
          id="md"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)' }}
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
            style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
          >
            <b className="text-lg font-bold">New Notebook</b>

            <input
              id="nn"
              type="text"
              placeholder="Title"
              aria-label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-xl border focus:outline-none focus:border-blue-500"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--bd)', color: 'var(--tx)' }}
            />

            {/* Cover Color Selection */}
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Cover Color</div>
              <div id="cvs" className="flex gap-2">
                {COVERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCover(c)}
                    className={`sw ${selectedCover === c ? 'on' : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cover color ${c}`}
                  />
                ))}
              </div>
            </div>

            {/* Paper Template Selector */}
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Paper Style</div>
              <select
                id="np"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full text-sm p-2 rounded-xl border focus:outline-none"
                style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--bg)', color: 'var(--tx)' }}
              >
                <option value="lined">Lined paper</option>
                <option value="blank">Blank paper</option>
                <option value="grid">Grid paper</option>
                <option value="dot">Dotted paper</option>
                <option value="cornell">Cornell notes</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                id="nc"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-sm font-semibold rounded-xl border"
                style={{ borderColor: 'var(--bd)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                id="ok"
                className="on px-5 py-2 text-sm font-semibold rounded-xl"
                style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
