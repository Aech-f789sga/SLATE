/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Notebook } from '../types/slate';
import { clearAllMedia } from '../services/mediaVault';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebooks: Notebook[];
  onRestoreNotebooks: (restored: Notebook[]) => void;
  onFactoryReset: () => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  notebooks,
  onRestoreNotebooks,
  onFactoryReset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportBackup = () => {
    const backupData = {
      appName: 'SLATE',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      notebooks,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLATE_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.notebooks)) {
          if (confirm(`Found ${parsed.notebooks.length} notebooks in backup. Do you want to restore them?`)) {
            onRestoreNotebooks(parsed.notebooks);
            onClose();
          }
        } else if (Array.isArray(parsed)) {
          // Direct array
          if (confirm(`Found ${parsed.length} notebooks in backup. Restore?`)) {
            onRestoreNotebooks(parsed);
            onClose();
          }
        } else {
          alert('Invalid SLATE backup file format.');
        }
      } catch {
        alert('Could not parse backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleWipeData = async () => {
    const confirmed = prompt(
      'WARNING: This will permanently erase ALL notebooks, sketches, pages, and media from this device. To confirm, type "DELETE":'
    );
    if (confirmed === 'DELETE') {
      try {
        localStorage.removeItem('inkpad');
        localStorage.removeItem('inkpad-gl');
        localStorage.removeItem('inkpad-fonts');
        await clearAllMedia();
        onFactoryReset();
        alert('All local app data has been successfully erased.');
        onClose();
      } catch {
        alert('Failed to erase all data.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-title"
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold" id="data-title">
              Data Safety &amp; Backup
            </h3>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(47, 109, 246, 0.15)', color: 'var(--ac)' }}
            >
              Export / Import
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            aria-label="Close data management dialog"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-4 text-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Export a full JSON backup of your notebooks to move them to another phone, iPad, tablet, or PC, or restore from a previous backup.
          </p>

          <div className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold">📦 Export Complete Backup</div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Saves all {notebooks.length} notebooks, pages, strokes, and figure libraries.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              className="on px-4 py-2 text-xs font-semibold rounded-xl flex-none"
              style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
            >
              Export JSON
            </button>
          </div>

          <div className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold">📥 Restore from Backup</div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select a previously exported SLATE JSON backup file.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-semibold rounded-xl flex-none border"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--sf)' }}
            >
              Select File
            </button>
          </div>

          <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-red-600 dark:text-red-400">
                ⚠️ Permanent Data Deletion
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Google Play Store compliant account &amp; data erasure. Wipes all local notebooks, media vault files, and settings.
              </p>
            </div>
            <button
              onClick={handleWipeData}
              className="px-4 py-2 text-xs font-semibold rounded-xl flex-none text-white bg-red-600 hover:bg-red-700 transition"
            >
              Wipe All Data
            </button>
          </div>
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
