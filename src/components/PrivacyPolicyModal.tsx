/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
    >
      <div
        className="w-full max-w-md flex flex-col rounded-2xl p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold" id="privacy-title">
              Privacy Policy
            </h3>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(47, 109, 246, 0.12)', color: 'var(--ac)' }}
            >
              100% On-Device
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
          <div className="p-2.5 rounded-xl border" style={{ borderColor: 'var(--bd)' }}>
            <div className="font-semibold text-sm mb-0.5 flex items-center gap-1.5">
              <span>🔒</span> Zero Data Collection
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              Notes, drawings, and media stay strictly on your device. No cloud uploads.
            </p>
          </div>

          <div className="p-2.5 rounded-xl border" style={{ borderColor: 'var(--bd)' }}>
            <div className="font-semibold text-sm mb-0.5 flex items-center gap-1.5">
              <span>🖼️</span> Media Vault
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              Imported photos and videos are stored in private on-device storage.
            </p>
          </div>

          <div className="p-2.5 rounded-xl border" style={{ borderColor: 'var(--bd)' }}>
            <div className="font-semibold text-sm mb-0.5 flex items-center gap-1.5">
              <span>✍️</span> Synthesized Audio
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              Pen friction sounds are generated via Web Audio. Microphone is never used.
            </p>
          </div>

          <div className="p-2.5 rounded-xl border" style={{ borderColor: 'var(--bd)' }}>
            <div className="font-semibold text-sm mb-0.5 flex items-center gap-1.5">
              <span>🛡️</span> No Ads or Trackers
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              No account required, no cookies, and no third-party telemetry.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--bd)' }}>
          <button
            onClick={onClose}
            className="on px-4 py-1.5 text-xs font-semibold rounded-xl"
            style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
