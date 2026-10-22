/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { listAllMediaItems, getMediaItem, getMediaUrl, deleteMediaItem } from '../services/mediaVault';

interface MediaGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertMedia: (mediaId: string, type: 'image' | 'video' | 'file', name: string) => void;
}

export const MediaGalleryModal: React.FC<MediaGalleryModalProps> = ({ isOpen, onClose, onInsertMedia }) => {
  const [items, setItems] = useState<Array<{ id: string; name: string; type: string; size: number; createdAt: number }>>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const list = await listAllMediaItems();
      setItems(list);
      const urls: Record<string, string> = {};
      for (const item of list.slice(0, 30)) {
        const u = await getMediaUrl(item.id);
        if (u) urls[item.id] = u;
      }
      setThumbnails(urls);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMedia();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this file from your vault?')) return;
    await deleteMediaItem(id);
    await loadMedia();
  };

  const handleExport = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = await getMediaItem(id);
    if (!item) return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'media_export';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-title"
    >
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold" id="gallery-title">
              Media Vault
            </h3>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(47, 109, 246, 0.12)', color: 'var(--ac)' }}
            >
              {items.length} {items.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-3 flex-1 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-xs text-gray-400">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center text-gray-400 text-xs border border-dashed rounded-xl p-4" style={{ borderColor: 'var(--bd)' }}>
              <span className="text-2xl mb-1">🖼️</span>
              <p className="font-semibold text-gray-500">No media yet</p>
              <p className="mt-0.5">Inserted photos and videos will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onInsertMedia(item.id, item.type as 'image' | 'video' | 'file', item.name);
                    onClose();
                  }}
                  className="rounded-xl border p-2 cursor-pointer transition hover:border-blue-500 flex flex-col justify-between"
                  style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 94%, var(--bg))' }}
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/10 flex items-center justify-center relative">
                    {item.type === 'image' && thumbnails[item.id] ? (
                      <img src={thumbnails[item.id]} alt={item.name} className="w-full h-full object-cover" />
                    ) : item.type === 'video' ? (
                      thumbnails[item.id] ? (
                        <video src={thumbnails[item.id]} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">🎥</span>
                      )
                    ) : (
                      <span className="text-xl">📄</span>
                    )}
                    <span className="absolute top-1 left-1 bg-black/70 text-[9px] text-white px-1.5 py-0.5 rounded font-mono uppercase">
                      {item.type}
                    </span>
                  </div>

                  <div className="mt-1.5 text-xs">
                    <p className="font-medium truncate" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatSize(item.size)}
                    </p>
                  </div>

                  <div className="mt-1 flex gap-1 justify-end border-t pt-1" style={{ borderColor: 'var(--bd)' }}>
                    <button
                      onClick={(e) => handleExport(item.id, item.name, e)}
                      title="Save"
                      className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      💾
                    </button>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Delete"
                      className="text-[11px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--bd)' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl border"
            style={{ borderColor: 'var(--bd)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
