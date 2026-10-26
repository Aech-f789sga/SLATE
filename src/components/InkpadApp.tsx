/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { TIPD } from '../services/brushTips';
import { BRD, BRX, FONTS, FF, COLORS, COVERS, SYM } from '../services/brushData';
import {
  auth,
  onAuthStateChanged,
  firebaseSignOut,
  saveNotebookToCloud,
  deleteNotebookFromCloud,
  loadNotebooksFromCloud,
  saveUserDataToCloud,
  loadUserDataFromCloud,
  User,
} from '../services/firebase';
import { AuthModal } from './AuthModal';
import { initInkpadEngine } from '../services/inkpadEngine';

export const InkpadApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'local'>('local');
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running as standalone PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Initialize Inkpad engine after DOM is ready
    setTimeout(() => {
      initInkpadEngine();
    }, 50);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setSyncStatus('syncing');
        try {
          const cloudNotebooks = await loadNotebooksFromCloud(user.uid);
          if (cloudNotebooks && cloudNotebooks.length > 0) {
            // Merge with local notebooks
            const storedLocal = localStorage.getItem('inkpad');
            let localList: any[] = [];
            try {
              localList = storedLocal ? JSON.parse(storedLocal) : [];
            } catch {
              localList = [];
            }

            const map = new Map<number | string, any>();
            // Add cloud notebooks
            cloudNotebooks.forEach((nb) => map.set(nb.id, nb));
            // Add or overwrite with newer local notebooks
            localList.forEach((nb) => {
              const existing = map.get(nb.id);
              if (!existing || (nb.upd || 0) >= (existing.upd || 0)) {
                map.set(nb.id, nb);
              }
            });

            const merged = Array.from(map.values());
            localStorage.setItem('inkpad', JSON.stringify(merged));
            if ((window as any).__inkpad_setLib) {
              (window as any).__inkpad_setLib(merged);
            }
          }

          // Load general library figures
          const userData = await loadUserDataFromCloud(user.uid);
          if (userData?.generalLib && (window as any).__inkpad_setGL) {
            (window as any).__inkpad_setGL(userData.generalLib);
          }
          setSyncStatus('synced');
        } catch (err) {
          console.error('Error loading cloud data:', err);
          setSyncStatus('synced');
        }
      } else {
        setSyncStatus('local');
      }
    });

    return () => unsub();
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Inkpad Original DOM Shell */}
      <div id="lib">
        <nav id="nav">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            <b style={{ marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Inkpad</span>
              {syncStatus === 'synced' && (
                <span title="Cloud Synced with Firebase" style={{ fontSize: '11px', color: '#2a9d4f', fontWeight: 600 }}>
                  ☁️ Synced
                </span>
              )}
              {syncStatus === 'syncing' && (
                <span title="Syncing to Cloud" style={{ fontSize: '11px', color: '#2f6df6', fontWeight: 600 }}>
                  ☁️ Syncing…
                </span>
              )}
              {syncStatus === 'local' && (
                <span title="Local offline storage" style={{ fontSize: '11px', color: 'var(--mu)', fontWeight: 600 }}>
                  💻 Guest
                </span>
              )}
            </b>
            {currentUser ? (
              <div style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--mu)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={currentUser.email || ''}>
                  👤 {currentUser.displayName || currentUser.email}
                </span>
                <button
                  type="button"
                  className="ic"
                  style={{ textAlign: 'left', padding: '2px 0', fontSize: '11px', color: 'var(--ac)' }}
                  onClick={() => firebaseSignOut(auth)}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: '4px 6px',
                }}
              >
                🔐 Sign In / Up
              </button>
            )}
          </div>

          <a data-f="all" data-n="Documents" className="on">
            📚 Documents
          </a>
          <a data-f="fav" data-n="Favorites">
            ★ Favorites
          </a>
          <a data-f="trash" data-n="Trash">
            🗑 Trash
          </a>

          {!isStandalone && deferredInstallPrompt && (
            <button
              type="button"
              onClick={async () => {
                await deferredInstallPrompt.prompt();
                setDeferredInstallPrompt(null);
              }}
              style={{
                marginTop: 'auto',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 10px',
                background: 'var(--sf)',
                borderColor: 'var(--ac)',
                color: 'var(--ac)',
              }}
            >
              📲 Install App (PWA)
            </button>
          )}
        </nav>

        <div id="libm">
          <h1 id="lh">Documents</h1>
          <button id="et" style={{ display: 'none', marginBottom: '12px' }}>
            Empty trash
          </button>
          <div id="md">
            <div className="box">
              <b>New notebook</b>
              <input type="text" id="nn" placeholder="Title" aria-label="Title" />
              <div id="cvs" style={{ display: 'flex', gap: '8px' }}></div>
              <select id="np">
                <option value="lined">Lined paper</option>
                <option value="blank">Blank paper</option>
                <option value="grid">Grid paper</option>
                <option value="dot">Dotted paper</option>
                <option value="cornell">Cornell notes</option>
              </select>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button id="nc">Cancel</button>
                <button id="ok" className="on">
                  Create
                </button>
              </div>
            </div>
          </div>
          <input
            id="find"
            placeholder="Search notebooks"
            aria-label="Search notebooks"
            style={{
              marginBottom: '16px',
              width: '100%',
              maxWidth: '320px',
              font: 'inherit',
              padding: '8px',
              borderRadius: '10px',
              border: '1px solid var(--bd)',
              background: 'var(--sf)',
              color: 'var(--tx)',
            }}
          />
          <div className="grid" id="grid"></div>
        </div>
      </div>

      <div id="pr"></div>
      <button id="fx" style={{ display: 'none', position: 'fixed', top: '12px', right: '12px', zIndex: 5 }}>
        Exit full screen
      </button>

      <div id="ed">
        <div id="bar">
          <button id="back">‹ Library</button>
          <input type="text" id="title" aria-label="Notebook title" />
          <span className="sep"></span>
          <button data-t="pen" className="on">✎ Pen</button>
          <button data-t="hl">🖍 Highlight</button>
          <button data-t="er"></button>
          <button data-t="pe"></button>
          <button data-t="line" title="Line">╱</button>
          <button data-t="rect" title="Rectangle">▭</button>
          <button data-t="ell" title="Oval">◯</button>
          <button data-t="text" title="Text">T</button>
          <select id="fnt" aria-label="Font"></select>
          <input type="file" id="ffile" accept=".ttf,.otf,.woff,.woff2" hidden />
          <button data-t="sel"></button>
          <button data-t="laser"></button>
          <button data-t="bk"></button>
          <button id="img" title="Insert image">🖼</button>
          <input type="file" id="file" accept="image/*" hidden />
          <button id="sg" title="Enlarge selection">⤢</button>
          <button id="ss" title="Shrink selection">⤡</button>
          <button id="dsel"></button>
          <button id="fs"></button>
          <button id="share"></button>
          <span className="sep"></span>
          <span id="sws"></span>
          <input type="color" id="col" defaultValue="#111111" aria-label="Custom color" style={{ width: '32px', height: '28px', padding: 0 }} />
          <input type="range" id="size" min="1" max="24" defaultValue="3" aria-label="Stroke size" />
          <select id="pt" aria-label="Pen type">
            <option value="ball">Ballpoint</option>
            <option value="fountain">Fountain</option>
            <option value="brush">Brush</option>
            <option value="pencil">Pencil</option>
            <option value="crayon">Crayon</option>
            <option value="marker">Marker</option>
          </select>
          <select id="prs" aria-label="Stylus pressure" title="Stylus pressure (re-pick to recalibrate for a new pen)">
            <option value="1">Pressure: normal</option>
            <option value=".6">Pressure: soft</option>
            <option value="1.7">Pressure: firm</option>
            <option value="off">Pressure: off</option>
          </select>
          <span className="sep"></span>
          <button id="undo">↶</button>
          <button id="redo">↷</button>
          <button id="clr">Clear page</button>
          <span className="sep"></span>
          <button id="zo">🔍−</button>
          <button id="zi">🔍+</button>
          <button id="side-t" title="Page thumbnails">▦</button>
          <label>
            <input type="checkbox" id="po" /> Pen only
          </label>
          <label>
            <input type="checkbox" id="snd" defaultChecked /> Sound
          </label>
          <select id="tpl" aria-label="Page template">
            <option value="blank">Blank</option>
            <option value="lined">Lined</option>
            <option value="grid">Grid</option>
            <option value="dot">Dotted</option>
            <option value="cornell">Cornell</option>
          </select>
          <select id="pc" aria-label="Paper color">
            <option value="">White paper</option>
            <option value="#fbf3dc">Cream</option>
            <option value="#fff7a8">Yellow</option>
            <option value="#1f2430">Dark</option>
          </select>
        </div>
        <div id="main">
          <div id="side"></div>
          <div id="stage">
            <div id="wrap">
              <canvas id="cv"></canvas>
              <textarea id="tx" aria-label="Text box"></textarea>
            </div>
          </div>
        </div>
        <div id="pg">
          <button id="prev">‹</button>
          <span id="pn"></span>
          <button id="next">›</button>
          <button id="add">+ Page</button>
          <button id="dup">Duplicate</button>
          <button id="del">Delete page</button>
        </div>
      </div>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={() => {
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
};
