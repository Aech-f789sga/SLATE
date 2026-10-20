/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    // Check if running as standalone PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(iosDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>Offline Mode — Notes and media stored locally on device</span>
        </div>
      )}

      {/* Install Button when installable or on iOS browser */}
      {!isInstalled && (deferredPrompt || isIOS) && (
        <button
          onClick={handleInstallClick}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition shadow-sm hover:border-blue-500"
          style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)', color: 'var(--tx)' }}
          title={isIOS ? 'Install SLATE on iPhone/iPad' : 'Install SLATE App'}
          aria-label="Install SLATE App"
        >
          <span className="text-sm">📲</span>
          <span>Install App</span>
        </button>
      )}

      {/* iOS Safari Guide Modal */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
          >
            <h3 className="text-base font-bold mb-2">Install SLATE on iOS</h3>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              To install SLATE on your iPhone or iPad for full screen stylus drawing:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-gray-700 dark:text-gray-200">
              <li>
                Tap the <strong>Share</strong> button (
                <span className="inline-block border px-1 rounded text-[10px]">⎋ / ⎚</span>) at the bottom or top of Safari.
              </li>
              <li>
                Scroll down in the share menu and tap <strong>Add to Home Screen</strong> (
                <span className="inline-block border px-1 rounded text-[10px]">➕</span>).
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner.
              </li>
            </ol>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowIOSModal(false)}
                className="on px-4 py-1.5 text-xs font-semibold rounded-xl"
                style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
