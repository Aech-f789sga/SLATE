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
          if (confirm(`Restore ${parsed.notebooks.length} notebooks?`)) {
            onRestoreNotebooks(parsed.notebooks);
            onClose();
          }
        } else if (Array.isArray(parsed)) {
          if (confirm(`Restore ${parsed.length} notebooks?`)) {
            onRestoreNotebooks(parsed);
            onClose();
          }
        } else {
          alert('Invalid backup file.');
        }
      } catch {
        alert('Could not read backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleWipeData = async () => {
    const confirmed = prompt('Type "DELETE" to permanently erase all notebooks and media:');
    if (confirmed === 'DELETE') {
      try {
        localStorage.removeItem('inkpad');
        localStorage.removeItem('inkpad-gl');
        localStorage.removeItem('inkpad-fonts');
        await clearAllMedia();
        onFactoryReset();
        onClose();
      } catch {
        alert('Failed to erase all data.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-title"
    >
      <div
        className="w-full max-w-md flex flex-col rounded-2xl p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--bd)' }}>
          <h3 className="text-base font-bold" id="data-title">
            Backup &amp; Storage
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="py-3 space-y-2.5 text-xs">
          {/* Export */}
          <div className="p-3 rounded-xl border flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <span>📦</span> Export Backup
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Save {notebooks.length} notebooks as a JSON file.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg flex-none"
              style={{ backgroundColor: 'var(--ac)', color: '#fff' }}
            >
              Export
            </button>
          </div>

          {/* Import */}
          <div className="p-3 rounded-xl border flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <span>📥</span> Restore Backup
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Load notebooks from a backup file.
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
              className="px-3 py-1.5 text-xs font-semibold rounded-lg flex-none border"
              style={{ borderColor: 'var(--bd)' }}
            >
              Select File
            </button>
          </div>

          {/* Wipe */}
          <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-500/5 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <span>⚠️</span> Erase All Data
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Permanently wipes all local notebooks and media.
              </p>
            </div>
            <button
              onClick={handleWipeData}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg flex-none text-white bg-red-600 hover:bg-red-700 transition"
            >
              Wipe
            </button>
          </div>
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
