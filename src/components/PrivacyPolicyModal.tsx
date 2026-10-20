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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
    >
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold" id="privacy-title">
              SLATE Privacy Policy
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(47, 109, 246, 0.15)', color: 'var(--ac)' }}
            >
              Google Play &amp; Apple Store Verified
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            aria-label="Close Privacy Policy"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-4 text-sm leading-relaxed pr-1">
          <div>
            <h4 className="font-semibold text-base mb-1">1. Zero Data Collection &amp; 100% On-Device Privacy</h4>
            <p className="text-gray-600 dark:text-gray-300">
              SLATE is built on a privacy-first, zero-telemetry architecture. All notebooks, handwritten strokes, drawings, imported photos, videos, custom fonts, and audio effects are stored strictly on your local device using standard HTML5 LocalStorage and sandboxed IndexedDB storage.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-base mb-1">2. Media Storage &amp; Gallery Permissions</h4>
            <p className="text-gray-600 dark:text-gray-300">
              When you choose to insert an image or video into your notes:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-600 dark:text-gray-300">
              <li>
                <strong>Photos and Videos:</strong> Stored securely in a private on-device IndexedDB database vault. Your media is never uploaded to any remote server or shared with third parties.
              </li>
              <li>
                <strong>Camera Access:</strong> Used only on-demand when you explicitly tap to take a photo or scan a document to embed directly onto the page.
              </li>
              <li>
                <strong>Files and Fonts:</strong> Used solely to load local font files (.ttf, .otf, .woff, .woff2) or save exported PDF documents.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-base mb-1">3. Realistic Acoustic Sound Synthesis</h4>
            <p className="text-gray-600 dark:text-gray-300">
              The optional pen and pencil sound effects are synthesized in real-time on your device using the Web Audio API (AudioContext) via synthetic noise filtering. The microphone is never accessed or recorded.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-base mb-1">4. Data Deletion &amp; Account Rights (Google Play Policy)</h4>
            <p className="text-gray-600 dark:text-gray-300">
              You maintain total ownership of your data. You can export complete backups of all your notebooks, pages, and media at any time, or permanently delete all local data using the Data Management menu.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-base mb-1">5. Children’s Privacy (COPPA) &amp; GDPR</h4>
            <p className="text-gray-600 dark:text-gray-300">
              SLATE does not require accounts, sign-ins, or personally identifiable information (PII). It is safe for all ages, including children and educational institutions.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t flex justify-end" style={{ borderColor: 'var(--bd)' }}>
          <button
            onClick={onClose}
            className="on px-5 py-2 text-sm font-semibold rounded-xl"
            style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
