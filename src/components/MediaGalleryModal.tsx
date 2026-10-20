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
      // load preview urls
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
    if (!confirm('Are you sure you want to delete this media item from your secure vault?')) return;
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
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-title"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold" id="gallery-title">
              Media Vault &amp; Gallery
            </h3>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(47, 109, 246, 0.15)', color: 'var(--ac)' }}
            >
              {items.length} Files
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            aria-label="Close media gallery"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Secure, on-device media storage for all inserted photos, recorded clips, and documents. Tap any item to insert onto your current page or export to your device gallery.
        </p>

        <div className="overflow-y-auto py-4 flex-1 min-h-[220px]">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-500">
              Loading stored media...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-gray-500 text-sm border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--bd)' }}>
              <span className="text-3xl mb-2">🖼️</span>
              <p className="font-semibold">No media in vault yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Insert photos, videos, or documents from the top toolbar to store them here safely.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onInsertMedia(item.id, item.type as 'image' | 'video' | 'file', item.name);
                    onClose();
                  }}
                  className="group relative rounded-xl border p-2 cursor-pointer transition hover:border-blue-500 flex flex-col justify-between"
                  style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 92%, var(--bg))' }}
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/10 flex items-center justify-center relative">
                    {item.type === 'image' && thumbnails[item.id] ? (
                      <img src={thumbnails[item.id]} alt={item.name} className="w-full h-full object-cover" />
                    ) : item.type === 'video' ? (
                      thumbnails[item.id] ? (
                        <video src={thumbnails[item.id]} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🎥</span>
                      )
                    ) : (
                      <span className="text-2xl">📄</span>
                    )}

                    <div className="absolute top-1 left-1 bg-black/60 text-[10px] text-white px-1.5 py-0.5 rounded font-mono uppercase">
                      {item.type}
                    </div>
                  </div>

                  <div className="mt-2 text-xs">
                    <p className="font-semibold truncate" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {formatSize(item.size)}
                    </p>
                  </div>

                  <div className="mt-2 flex gap-1 justify-end border-t pt-1.5" style={{ borderColor: 'var(--bd)' }}>
                    <button
                      onClick={(e) => handleExport(item.id, item.name, e)}
                      title="Download / Save to device gallery"
                      className="text-[11px] px-2 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      💾
                    </button>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Delete media"
                      className="text-[11px] px-2 py-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      🗑️
                    </button>
                    <button
                      title="Insert onto page"
                      className="text-[11px] px-2 py-0.5 rounded font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                      Insert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t flex justify-end" style={{ borderColor: 'var(--bd)' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-semibold rounded-xl"
            style={{ backgroundColor: 'var(--sf)', border: '1px solid var(--bd)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
