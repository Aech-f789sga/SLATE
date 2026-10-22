/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Notebook } from './types/slate';
import { LibraryView } from './components/LibraryView';
import { SlateEditor } from './components/SlateEditor';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { PermissionsModal } from './components/PermissionsModal';
import { MediaGalleryModal } from './components/MediaGalleryModal';
import { DataManagementModal } from './components/DataManagementModal';
import { soundEngine } from './services/soundEngine';

// Default starter notebook seed if first launch
const DEFAULT_NOTEBOOK: Notebook = {
  id: 1700000000000,
  name: 'Welcome to SLATE',
  cover: '#2f6df6',
  upd: Date.now(),
  fav: true,
  pages: [
    {
      tpl: 'lined',
      col: null,
      pw: 800,
      ph: 1100,
      strokes: [
        {
          t: 'text',
          c: '#111111',
          s: 28,
          x: 120,
          y: 160,
          txt: 'Welcome to SLATE 📓',
          f: 'caveat',
        },
        {
          t: 'text',
          c: '#6e6e73',
          s: 16,
          x: 120,
          y: 220,
          txt: 'Digital handwritten notes, sketches & multimedia canvas for Mobile, Android & Apple.',
          f: 'arial',
        },
        {
          t: 'shape',
          k: 'rect',
          c: '#2f6df6',
          w: 2,
          a: [110, 140],
          b: [720, 270],
        },
        {
          t: 'shape',
          k: 'arrow',
          c: '#2a9d4f',
          w: 3,
          a: [120, 360],
          b: [340, 360],
        },
        {
          t: 'text',
          c: '#2a9d4f',
          s: 18,
          x: 360,
          y: 348,
          txt: 'Insert Photos, Videos & Audio securely',
          f: 'patrick',
        },
      ],
    },
  ],
};

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
    try {
      const stored = localStorage.getItem('inkpad');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback to default
    }
    return [DEFAULT_NOTEBOOK];
  });

  const [activeNotebookId, setActiveNotebookId] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Modals state
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);

  // Save to localStorage whenever notebooks change
  const persistNotebooks = useCallback((updated: Notebook[]) => {
    setNotebooks(updated);
    try {
      localStorage.setItem('inkpad', JSON.stringify(updated));
    } catch {
      // ignore quota if any
    }
  }, []);

  const handleCreateNotebook = (name: string, cover: string, template: string) => {
    const newNb: Notebook = {
      id: Date.now(),
      name,
      cover,
      upd: Date.now(),
      pages: [
        {
          tpl: template,
          col: null,
          pw: 800,
          ph: 1100,
          strokes: [],
        },
      ],
    };
    const updated = [newNb, ...notebooks];
    persistNotebooks(updated);
    setActiveNotebookId(newNb.id);
  };

  const handleUpdateActiveNotebook = (updated: Notebook) => {
    const list = notebooks.map((n) => (n.id === updated.id ? updated : n));
    persistNotebooks(list);
  };

  const handleToggleFavorite = (id: number) => {
    const list = notebooks.map((n) => (n.id === id ? { ...n, fav: !n.fav, upd: Date.now() } : n));
    persistNotebooks(list);
  };

  const handleToggleTrash = (id: number) => {
    const list = notebooks.map((n) => (n.id === id ? { ...n, del: n.del ? 0 : 1, upd: Date.now() } : n));
    persistNotebooks(list);
  };

  const handleEmptyTrash = () => {
    const list = notebooks.filter((n) => !n.del);
    persistNotebooks(list);
  };

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    soundEngine.enabled = enabled;
  };

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId);

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Hidden container for print / PDF generation */}
      <div id="pr" className="hidden" aria-hidden="true" />

      {/* View Switcher: Editor vs Library */}
      {activeNotebook ? (
        <SlateEditor
          notebook={activeNotebook}
          onBackToLibrary={() => setActiveNotebookId(null)}
          onSaveNotebook={handleUpdateActiveNotebook}
          soundEnabled={soundEnabled}
          onOpenPrivacyPolicy={() => setIsPrivacyOpen(true)}
          onOpenPermissions={() => setIsPermissionsOpen(true)}
          onOpenGallery={() => setIsGalleryOpen(true)}
        />
      ) : (
        <LibraryView
          notebooks={notebooks}
          onOpenNotebook={(id) => setActiveNotebookId(typeof id === 'number' ? id : (id as any).id)}
          onCreateNotebook={handleCreateNotebook}
          onToggleFavorite={handleToggleFavorite}
          onToggleTrash={handleToggleTrash}
          onEmptyTrash={handleEmptyTrash}
          onOpenPrivacyPolicy={() => setIsPrivacyOpen(true)}
          onOpenPermissions={() => setIsPermissionsOpen(true)}
          onOpenGallery={() => setIsGalleryOpen(true)}
          onOpenDataManagement={() => setIsDataOpen(true)}
        />
      )}

      {/* Store Compliance & Privacy Modals */}
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />

      <PermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenPrivacyPolicy={() => {
          setIsPermissionsOpen(false);
          setIsPrivacyOpen(true);
        }}
      />

      <MediaGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onInsertMedia={(_mediaId, _type, _name) => {
          // If in editor, SlateEditor receives insert
        }}
      />

      <DataManagementModal
        isOpen={isDataOpen}
        onClose={() => setIsDataOpen(false)}
        notebooks={notebooks}
        onRestoreNotebooks={(restored) => {
          persistNotebooks(restored);
        }}
        onFactoryReset={() => {
          persistNotebooks([DEFAULT_NOTEBOOK]);
          setActiveNotebookId(null);
        }}
      />
    </div>
  );
}
