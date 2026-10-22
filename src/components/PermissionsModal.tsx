/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getStorageStats } from '../services/mediaVault';

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  onOpenPrivacyPolicy: () => void;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenPrivacyPolicy,
}) => {
  const [stats, setStats] = useState<{ itemCount: number; totalSizeBytes: number }>({
    itemCount: 0,
    totalSizeBytes: 0,
  });

  useEffect(() => {
    if (isOpen) {
      getStorageStats().then(setStats).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-title"
    >
      <div
        className="w-full max-w-md flex flex-col rounded-2xl p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold" id="perm-title">
              Permissions &amp; Safety
            </h3>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(42, 157, 79, 0.12)', color: '#2a9d4f' }}
            >
              On-Device
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

        <div className="py-3 space-y-2.5 text-xs">
          {/* Gallery Permission */}
          <div className="p-2.5 rounded-xl border flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <span>🖼️</span> Photos &amp; Gallery
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Insert photos and videos into your notes.
              </p>
            </div>
            <span className="text-[11px] text-green-600 font-semibold bg-green-500/10 px-2 py-0.5 rounded-full flex-none">
              On Demand
            </span>
          </div>

          {/* Camera Permission */}
          <div className="p-2.5 rounded-xl border flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <span>📷</span> Camera
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Snap photos directly onto notebook pages.
              </p>
            </div>
            <span className="text-[11px] text-green-600 font-semibold bg-green-500/10 px-2 py-0.5 rounded-full flex-none">
              On Demand
            </span>
          </div>

          {/* Storage Stats */}
          <div className="p-2.5 rounded-xl border flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <span>💾</span> Local Storage Vault
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                {stats.itemCount} media files ({formatBytes(stats.totalSizeBytes)}) stored on device.
              </p>
            </div>
            <span className="text-[11px] text-blue-600 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-full flex-none">
              Private
            </span>
          </div>

          {/* Audio Synthesizer */}
          <div className="p-2.5 rounded-xl border flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <span>🔊</span> Pen Sound Effects
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Acoustic friction feedback while drawing.
              </p>
            </div>
            <button
              onClick={() => onToggleSound(!soundEnabled)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                soundEnabled ? 'on' : 'text-gray-500'
              }`}
              style={soundEnabled ? { backgroundColor: 'var(--ac)', color: '#fff' } : {}}
            >
              {soundEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--bd)' }}>
          <button
            onClick={() => {
              onClose();
              onOpenPrivacyPolicy();
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            Privacy Policy
          </button>
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
