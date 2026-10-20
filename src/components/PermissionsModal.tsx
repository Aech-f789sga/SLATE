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
  const [stats, setStats] = useState<{ itemCount: number; totalSizeBytes: number; estimateQuota?: number }>({
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-title"
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold" id="perm-title">
              Permissions &amp; Data Safety
            </h3>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(42, 157, 79, 0.15)', color: '#2a9d4f' }}
            >
              Secure Sandbox
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            aria-label="Close permissions dialog"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-4 text-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            SLATE requests only on-demand device capabilities necessary to insert photos, videos, custom typography, and audio synthesis into your notes. No telemetry or background tracking is ever performed.
          </p>

          <div className="space-y-3">
            {/* Gallery Permission */}
            <div
              className="p-3 rounded-xl border flex items-start justify-between gap-3"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 90%, var(--bg))' }}
            >
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span>🖼️ Photos &amp; Video Gallery</span>
                  <span className="text-[11px] text-green-600 font-bold bg-green-500/10 px-1.5 py-0.5 rounded">
                    Granted on Select
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Required to choose and embed photos, diagrams, and video clips into notes. Stored locally in your device vault.
                </p>
              </div>
            </div>

            {/* Camera Permission */}
            <div
              className="p-3 rounded-xl border flex items-start justify-between gap-3"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 90%, var(--bg))' }}
            >
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span>📷 Camera (Optional)</span>
                  <span className="text-[11px] text-blue-600 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">
                    On-Demand
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Prompted only if you choose to take a photo or scan paper directly using your mobile camera.
                </p>
              </div>
            </div>

            {/* Files & Fonts */}
            <div
              className="p-3 rounded-xl border flex items-start justify-between gap-3"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 90%, var(--bg))' }}
            >
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span>📁 File System &amp; Custom Fonts</span>
                  <span className="text-[11px] text-green-600 font-bold bg-green-500/10 px-1.5 py-0.5 rounded">
                    Active
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Allows importing .ttf/.otf/.woff handwriting fonts and exporting notebooks as PDF or JSON backups.
                </p>
              </div>
            </div>

            {/* Audio Synthesis */}
            <div
              className="p-3 rounded-xl border flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 90%, var(--bg))' }}
            >
              <div>
                <div className="font-semibold">✍️ Realistic Writing Sounds</div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Synthesizes realistic pen/pencil friction sound via AudioContext without microphone access.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => onToggleSound(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Storage Quota Card */}
          <div
            className="p-3.5 rounded-xl border"
            style={{ borderColor: 'var(--bd)', backgroundColor: 'color-mix(in srgb, var(--sf) 85%, var(--bg))' }}
          >
            <div className="flex justify-between items-center text-xs font-semibold mb-1">
              <span>Secure Vault Storage Usage</span>
              <span className="text-blue-500 font-bold">
                {formatBytes(stats.totalSizeBytes)} ({stats.itemCount} media items)
              </span>
            </div>
            {stats.estimateQuota && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                Device storage quota: {formatBytes(stats.estimateQuota)}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t flex justify-between items-center" style={{ borderColor: 'var(--bd)' }}>
          <button
            onClick={onOpenPrivacyPolicy}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            Read Full Privacy Policy →
          </button>
          <button
            onClick={onClose}
            className="on px-4 py-1.5 text-sm font-semibold rounded-xl"
            style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
