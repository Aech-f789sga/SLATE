/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Notebook,
  Page,
  AnyStroke,
  PenStroke,
  ShapeStroke,
  TextStroke,
  ImageStroke,
  VideoStroke,
  FigureItem,
  ToolType,
  StylusPressure,
} from '../types/slate';
import { BRD, BRX, FONTS, FF, COLORS, SYM } from '../services/brushData';
import { TIPD } from '../services/brushTips';
import { soundEngine } from '../services/soundEngine';
import { SIZES, READY_MADE_PAPERS, calculateLuminance, PaperPatternConfig } from '../utils/paperTemplates';
import { dens, inPoly, shapePts, zEnd, rotateBox, BoundingBox } from '../utils/geometry';
import { saveMediaItem, getMediaUrl } from '../services/mediaVault';
import { detectDevice, computeAutoZoom, ViewportState, AutoFitMode } from '../utils/layout';

const Ico: React.FC<{ path: string; size?: number }> = ({ path, size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: path }}
  />
);

const IC_PATHS = {
  pen: "<path d='M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19z'/><path d='M14 7l3 3'/>",
  hl: "<path d='M9 15l7-7 3 3-7 7z'/><path d='M9 15l-4 1 1 4 4-1M4 21h6'/>",
  er: "<path d='M5 13l8-8 6 6-7 7H8z'/><path d='M7 21h13'/>",
  line: "<path d='M4 18L10 6l6 12z'/><circle cx='17' cy='7' r='3.5'/>",
  text: "<path d='M5 6V4h14v2M12 4v16M9 20h6'/>",
  sel: "<path d='M12 4c5 0 9 2 9 5s-4 5-9 5-9-2-9-5 4-5 9-5z' stroke-dasharray='3 3'/><path d='M8 16c0 2 1 3 3 4'/>",
  bk: "<path d='M5 11l7-7 7 7-7 7z'/><path d='M3 21h7'/><path d='M19 14c1 1.5 2 2.5 2 3.5a2 2 0 01-4 0c0-1 1-2 2-3.5z' fill='currentColor'/>",
  laser: "<circle cx='12' cy='12' r='3' fill='currentColor'/><path d='M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2'/>",
  media: "<rect x='3' y='4' width='18' height='16' rx='2'/><circle cx='9' cy='10' r='1.5'/><path d='M21 17l-5-5-9 8'/>",
  library: "<path d='M4 5h4v14H4zM10 5h4v14h-4zM16 6l4-1 3 13-4 1z'/>",
  undo: "<path d='M9 14L4 9l5-5'/><path d='M4 9h10a6 6 0 010 12h-3'/>",
  redo: "<path d='M15 14l5-5-5-5'/><path d='M20 9H10a6 6 0 000 12h3'/>",
  thumbnails: "<rect x='3' y='4' width='18' height='16' rx='2'/><path d='M9 4v16'/>",
  paper: "<path d='M6 3h9l4 4v14H6z'/><path d='M15 3v4h4'/>",
  print: "<path d='M12 3v12M8 7l4-4 4 4M5 13v7h14v-7'/>",
  settings: "<circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1'/>",
};

interface SlateEditorProps {
  notebook: Notebook;
  onBackToLibrary: () => void;
  onSaveNotebook: (nb: Notebook) => void;
  soundEnabled: boolean;
  onOpenPrivacyPolicy: () => void;
  onOpenPermissions: () => void;
  onOpenGallery: () => void;
}

export const SlateEditor: React.FC<SlateEditorProps> = ({
  notebook,
  onBackToLibrary,
  onSaveNotebook,
  soundEnabled,
  onOpenPrivacyPolicy,
  onOpenPermissions,
  onOpenGallery,
}) => {
  const [nb, setNb] = useState<Notebook>(notebook);
  const [pi, setPi] = useState<number>(0);
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [size, setSize] = useState<number>(3);
  const [penType, setPenType] = useState<string>('ball');
  const [pressureMode, setPressureMode] = useState<StylusPressure>('1');
  const [penOnly, setPenOnly] = useState<boolean>(false);
  const [showThumbs, setShowThumbs] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [dpi, setDpi] = useState<number>(2);
  const [delArm, setDelArm] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-Responsive Layout & Orientation state (Phone / Tablet / PC, Landscape / Portrait)
  const [viewport, setViewport] = useState<ViewportState>(() =>
    typeof window !== 'undefined'
      ? detectDevice(window.innerWidth, window.innerHeight, 'ontouchstart' in window)
      : { width: 1024, height: 768, deviceType: 'desktop', orientation: 'landscape', isTouch: false }
  );
  const [autoFitMode, setAutoFitMode] = useState<AutoFitMode>('auto');
  const [showMobileMore, setShowMobileMore] = useState<boolean>(false);

  // Active drawer
  const [activeDrawer, setActiveDrawer] = useState<
    'brush' | 'shape' | 'lasso' | 'eraser' | 'symbols' | 'library' | 'paper' | 'settings' | 'arrange' | 'media' | null
  >(null);
  const [drawerAnchorRect, setDrawerAnchorRect] = useState<DOMRect | null>(null);

  // Canvas and Stage references
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const txRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  // Editor engine mutable state
  const stateRef = useRef<{
    W: number;
    H: number;
    zoom: number;
    cur: any;
    undo: string[];
    redo: string[];
    sel: AnyStroke[];
    lastP: [number, number, number] | null;
    trail: Array<[number, number, number]>;
    lpLoop: boolean;
    flipping: boolean;
    dashOn: boolean;
    lassoRect: boolean;
    axc: [string, string, string];
    pageFlipAnimation: boolean;
    scrollToTurnPages: boolean;
    generalLib: FigureItem[];
    textEditing: { x: number; y: number; s: number; c: string; w?: number; f: string } | null;
    animating: any;
    wasSel: any;
    penSeen: boolean;
    pressureCalib: { min: number; max: number; n: number };
    customFonts: Array<{ n: string; d: string }>;
  }>({
    W: 800,
    H: 1100,
    zoom: 1,
    cur: null,
    undo: [],
    redo: [],
    sel: [],
    lastP: null,
    trail: [],
    lpLoop: false,
    flipping: false,
    dashOn: false,
    lassoRect: false,
    axc: ['#e5383b', '#2a9d4f', '#2f6df6'],
    pageFlipAnimation: true,
    scrollToTurnPages: false,
    generalLib: [],
    textEditing: null,
    animating: null,
    wasSel: null,
    penSeen: false,
    pressureCalib: { min: 1, max: 0, n: 0 },
    customFonts: [],
  });

  const currentPage = nb.pages[pi] || nb.pages[0];

  // Helper toast
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2200);
  }, []);

  // Sync notebook state to parent and storage
  const saveState = useCallback(() => {
    const updated = { ...nb, upd: Date.now() };
    setNb(updated);
    onSaveNotebook(updated);
  }, [nb, onSaveNotebook]);

  // Snap for undo
  const snapUndo = useCallback(() => {
    const s = stateRef.current;
    s.undo.push(JSON.stringify(currentPage.strokes));
    if (s.undo.length > 60) s.undo.shift();
    s.redo = [];
  }, [currentPage]);

  // Texture caches
  const textureCacheRef = useRef<Record<string, HTMLCanvasElement>>({});
  const tintedCacheRef = useRef<Record<string, HTMLCanvasElement>>({});
  const stampCacheRef = useRef<WeakMap<any, any>>(new WeakMap());
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const drawRef = useRef<() => void>(() => {});

  // Initialize Brush Tip Masks
  useEffect(() => {
    Object.entries(TIPD).forEach(([k, b64]) => {
      try {
        const cleanB64 = b64.replace(/\s+/g, '');
        const byteCharacters = atob(cleanB64);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteNumbers], { type: 'image/png' });
        const blobUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d');
          if (g) {
            g.drawImage(img, 0, 0);
            const id = g.getImageData(0, 0, c.width, c.height);
            const dd = id.data;
            for (let j = 0; j < dd.length; j += 4) {
              dd[j + 3] = dd[j];
              dd[j] = dd[j + 1] = dd[j + 2] = 0;
            }
            g.putImageData(id, 0, 0);
            textureCacheRef.current[k] = c;
          }
          URL.revokeObjectURL(blobUrl);
        };
        img.src = blobUrl;
      } catch {
        // ignore
      }
    });

    // Load general figure library from local storage
    try {
      stateRef.current.generalLib = JSON.parse(localStorage.getItem('inkpad-gl') || '[]');
      const savedDpi = +localStorage.getItem('inkpad-dpi')!;
      if (savedDpi) setDpi(savedDpi);
      const settings = JSON.parse(localStorage.getItem('inkpad-set') || '{}');
      if ('flip' in settings) stateRef.current.pageFlipAnimation = settings.flip;
      if ('scroll' in settings) stateRef.current.scrollToTurnPages = settings.scroll;
    } catch {
      // ignore
    }
  }, []);

  // Listen to window resize and orientation changes
  useEffect(() => {
    const handleResize = () => {
      setViewport(detectDevice(window.innerWidth, window.innerHeight, 'ontouchstart' in window));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Update layout sizing automatically based on device and orientation
  const updateLayout = useCallback(() => {
    const s = stateRef.current;
    const stage = stageRef.current;
    const wrap = wrapRef.current;
    const cv = cvRef.current;
    if (!stage || !wrap || !cv) return;

    const pw = currentPage.pw || 800;
    const ph = currentPage.ph || 1100;
    s.W = pw;
    s.H = ph;

    cv.style.aspectRatio = `${pw}/${ph}`;

    // Auto calculate zoom according to device format and orientation
    if (autoFitMode !== 'actual') {
      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;
      const optimalZoom = computeAutoZoom(
        pw,
        ph,
        stageW,
        stageH,
        autoFitMode,
        viewport.orientation,
        viewport.deviceType
      );
      s.zoom = optimalZoom;
    }

    const targetW = Math.max(160, pw * s.zoom);
    wrap.style.width = `${targetW}px`;

    const capDpi = /Mobi|Android|iPad|iPhone/.test(navigator.userAgent) ? 4 : 6;
    const d = Math.min(dpi, capDpi);
    cv.width = pw * d;
    cv.height = ph * d;

    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
  }, [currentPage, dpi, autoFitMode, viewport]);

  // Stroke Bounding Box computation
  const getStrokeBounds = useCallback((s: AnyStroke): BoundingBox => {
    if (s.t === 'text') {
      const ts = s as TextStroke;
      const cv = cvRef.current;
      const ctx = cv?.getContext('2d');
      let textW = 20;
      if (ctx) {
        ctx.font = `${ts.s}px ${FF(ts.f)}`;
        textW = Math.max(12, ...ts.txt.split('\n').map((l) => ctx.measureText(l).width));
      }
      const lines = ts.txt.split('\n').length;
      return [ts.x, ts.y, ts.x + (ts.w || textW), ts.y + lines * ts.s * 1.3];
    }
    if (s.t === 'img' || s.t === 'vid' || s.t === 'file') {
      const m = s as ImageStroke | VideoStroke;
      return [m.x, m.y, m.x + m.w, m.y + m.h];
    }
    if (s.t === 'shape') {
      const sh = s as ShapeStroke;
      const z = sh.k === 'ax3' ? zEnd(sh.a, sh.b) : sh.a;
      return [
        Math.min(sh.a[0], sh.b[0], z[0]),
        Math.min(sh.a[1], sh.b[1], z[1]),
        Math.max(sh.a[0], sh.b[0], z[0]),
        Math.max(sh.a[1], sh.b[1], z[1]),
      ];
    }
    const ps = s as PenStroke;
    if (!ps.p || ps.p.length === 0) return [0, 0, 0, 0];
    const xs = ps.p.map((q) => q[0]);
    const ys = ps.p.map((q) => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }, []);

  const getSelectionBox = useCallback((): BoundingBox => {
    const sel = stateRef.current.sel;
    if (sel.length === 0) return [0, 0, 0, 0];
    const boxes = sel.map(getStrokeBounds);
    return [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ];
  }, [getStrokeBounds]);

  // Background Paper Rendering
  const renderBackground = useCallback((ctx: CanvasRenderingContext2D, page: Page) => {
    const s = stateRef.current;
    const W = page.pw || s.W;
    const H = page.ph || s.H;

    if (page.pp) {
      const pp = page.pp;
      ctx.fillStyle = pp.bg || '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const gap = pp.gap || 32;
      const lw = pp.lw || 1;
      ctx.strokeStyle = ctx.fillStyle = pp.ln || 'rgba(120,140,170,.4)';
      ctx.lineWidth = lw;

      const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      };

      if (pp.k === 'lined') {
        for (let y = Math.max(gap * 2, 60); y < H; y += gap) drawLine(0, y, W, y);
      } else if (pp.k === 'grid' || pp.k === 'graph') {
        for (let x = gap; x < W; x += gap) {
          ctx.lineWidth = pp.k === 'graph' && (x / gap) % 5 === 0 ? lw * 2 : lw;
          drawLine(x, 0, x, H);
        }
        for (let y = gap; y < H; y += gap) {
          ctx.lineWidth = pp.k === 'graph' && (y / gap) % 5 === 0 ? lw * 2 : lw;
          drawLine(0, y, W, y);
        }
      } else if (pp.k === 'dot') {
        for (let x = gap; x < W; x += gap) {
          for (let y = gap; y < H; y += gap) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5 * lw, 0, 7);
            ctx.fill();
          }
        }
      } else if (pp.k === 'iso') {
        const h = gap * 0.866;
        for (let r = 0, y = gap; y < H; y += h, r++) {
          for (let x = gap + (r % 2 ? gap / 2 : 0); x < W; x += gap) {
            ctx.beginPath();
            ctx.arc(x, y, 1.4 * lw, 0, 7);
            ctx.fill();
          }
        }
      } else if (pp.k === 'music') {
        for (let y = 90; y < H - 60; y += gap * 9) {
          for (let i = 0; i < 5; i++) drawLine(40, y + i * gap, W - 40, y + i * gap);
        }
      }

      if (pp.mg) {
        ctx.strokeStyle = pp.mg;
        ctx.lineWidth = 1.5;
        drawLine(pp.mx || 90, 0, pp.mx || 90, H);
      }
      return;
    }

    // Default template styles
    ctx.fillStyle = page.col || '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,140,170,.35)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(120,140,170,.55)';

    if (page.tpl === 'cornell') {
      for (let y = 120; y < 900; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,140,170,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(220, 70);
      ctx.lineTo(220, 900);
      ctx.moveTo(0, 900);
      ctx.lineTo(W, 900);
      ctx.stroke();
    } else if (page.tpl === 'lined') {
      for (let y = 120; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#f0a0a0';
      ctx.beginPath();
      ctx.moveTo(90, 0);
      ctx.lineTo(90, H);
      ctx.stroke();
    } else if (page.tpl === 'grid') {
      for (let x = 0; x < W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    } else if (page.tpl === 'dot') {
      for (let x = 32; x < W; x += 32) {
        for (let y = 32; y < H; y += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, 7);
          ctx.fill();
        }
      }
    }
  }, []);

  // Stroke renderer
  const renderSingleStroke = useCallback(
    (ctx: CanvasRenderingContext2D, s: AnyStroke) => {
      ctx.save();

      // Apply rotation if present
      if (s.r) {
        const b = getStrokeBounds(s);
        const cx = (b[0] + b[2]) / 2;
        const cy = (b[1] + b[3]) / 2;
        ctx.translate(cx, cy);
        ctx.rotate(s.r);
        ctx.translate(-cx, -cy);
      }

      if (s.t === 'ers') {
        const es = s as any;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.lineWidth = es.w;
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(es.p[0][0], es.p[0][1]);
        for (let i = 1; i < es.p.length; i++) {
          ctx.lineTo(es.p[i][0], es.p[i][1]);
        }
        ctx.stroke();
        ctx.restore();
        ctx.restore();
        return;
      }

      if (s.t === 'text') {
        const ts = s as TextStroke;
        ctx.font = `${ts.s}px ${FF(ts.f)}`;
        ctx.fillStyle = ts.c;
        ctx.textBaseline = 'top';
        const lines = ts.txt.split('\n');
        lines.forEach((l, idx) => {
          ctx.fillText(l, ts.x, ts.y + idx * ts.s * 1.3);
        });
        ctx.restore();
        return;
      }

      if (s.t === 'shape') {
        const sh = s as ShapeStroke;
        ctx.strokeStyle = ctx.fillStyle = sh.c;
        ctx.lineWidth = sh.w;
        ctx.lineCap = ctx.lineJoin = 'round';
        if (sh.ds) ctx.setLineDash([sh.w * 3 + 6, sh.w * 2 + 4]);

        const [x0, y0] = sh.a;
        const [x1, y1] = sh.b;

        const drawArrowHead = (x: number, y: number, dx: number, dy: number, col: string) => {
          const L = Math.hypot(dx, dy) || 1;
          const u = [dx / L, dy / L];
          const h = 12 + sh.w * 3.5;
          ctx.save();
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - u[0] * h + u[1] * h * 0.28, y - u[1] * h - u[0] * h * 0.28);
          ctx.lineTo(x - u[0] * h - u[1] * h * 0.28, y - u[1] * h + u[0] * h * 0.28);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };

        if (sh.k === 'rect') {
          ctx.beginPath();
          ctx.rect(x0, y0, x1 - x0, y1 - y0);
          ctx.stroke();
        } else if (sh.k === 'ell') {
          ctx.beginPath();
          ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, 7);
          ctx.stroke();
        } else if (sh.k === 'ax2' || sh.k === 'ax3') {
          const colors = sh.ac || stateRef.current.axc;
          const drawAxis = (p: [number, number], q: [number, number], col: string, label: string) => {
            const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
            ctx.strokeStyle = col;
            ctx.beginPath();
            const e = (12 + sh.w * 3.5) * 0.8;
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(q[0] - ((q[0] - p[0]) / L) * e, q[1] - ((q[1] - p[1]) / L) * e);
            ctx.stroke();
            drawArrowHead(q[0], q[1], q[0] - p[0], q[1] - p[1], col);
            ctx.save();
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.font = 'bold 16px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, q[0] + ((q[0] - p[0]) / L) * 16 - 4, q[1] + ((q[1] - p[1]) / L) * 16);
            ctx.restore();
          };
          drawAxis([x0, y0], [x1, y0], colors[0], 'x');
          drawAxis([x0, y0], [x0, y1], colors[1], 'y');
          if (sh.k === 'ax3') {
            drawAxis([x0, y0], zEnd(sh.a, sh.b), colors[2], 'z');
          }
        } else {
          // Line or Arrow
          const L = Math.hypot(x1 - x0, y1 - y0) || 1;
          const e = sh.k === 'arrow' ? (12 + sh.w * 3.5) * 0.8 : 0;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1 - ((x1 - x0) / L) * e, y1 - ((y1 - y0) / L) * e);
          ctx.stroke();
          if (sh.k === 'arrow') {
            drawArrowHead(x1, y1, x1 - x0, y1 - y0, sh.c);
          }
        }
        ctx.restore();
        return;
      }

      if (s.t === 'img') {
        const imgStroke = s as ImageStroke;
        let img = imageCacheRef.current[imgStroke.src];
        if (!img) {
          img = new Image();
          img.onload = () => drawRef.current();
          img.src = imgStroke.src;
          imageCacheRef.current[imgStroke.src] = img;
        }
        if (img.complete && img.naturalWidth) {
          ctx.drawImage(img, imgStroke.x, imgStroke.y, imgStroke.w, imgStroke.h);
        }
        ctx.restore();
        return;
      }

      if (s.t === 'vid') {
        const vs = s as VideoStroke;
        let vid = videoElementsRef.current[vs.id];
        if (!vid) {
          vid = document.createElement('video');
          vid.playsInline = true;
          vid.loop = true;
          vid.preload = 'auto';
          if (vs.mediaId) {
            getMediaUrl(vs.mediaId).then((url) => {
              if (url) vid.src = url;
            });
          } else if (vs.src) {
            vid.src = vs.src;
          }
          vid.onloadeddata = () => drawRef.current();
          videoElementsRef.current[vs.id] = vid;
        }

        ctx.fillStyle = '#111';
        ctx.fillRect(vs.x, vs.y, vs.w, vs.h);
        if (vid.readyState >= 2) {
          ctx.drawImage(vid, vs.x, vs.y, vs.w, vs.h);
        }
        if (vid.paused) {
          const cx = vs.x + vs.w / 2;
          const cy = vs.y + vs.h / 2;
          const r = Math.min(vs.w, vs.h) * 0.06 + 5;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.9, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.6, cy - r);
          ctx.lineTo(cx + r, cy);
          ctx.lineTo(cx - r * 0.6, cy + r);
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      // Pen and Highlighter Strokes
      const ps = s as PenStroke;
      const p = ps.p;
      if (!p || p.length === 0) {
        ctx.restore();
        return;
      }

      // Check stamp brush
      const brushDef = BRX[ps.v];
      if (brushDef && brushDef.t && textureCacheRef.current[brushDef.t]) {
        // Procedural stamp rendering
        const key = brushDef.t + ps.c;
        let tinted = tintedCacheRef.current[key];
        if (!tinted) {
          const orig = textureCacheRef.current[brushDef.t];
          const tc = document.createElement('canvas');
          tc.width = orig.width;
          tc.height = orig.height;
          const tg = tc.getContext('2d');
          if (tg) {
            tg.drawImage(orig, 0, 0);
            tg.globalCompositeOperation = 'source-in';
            tg.fillStyle = ps.c;
            tg.fillRect(0, 0, tc.width, tc.height);
            tintedCacheRef.current[key] = tc;
            tinted = tc;
          }
        }

        if (tinted) {
          const sc = ps.w / 3;
          const sd = ps.sd || 1;
          const hr = (n: number) => {
            const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
            return x - Math.floor(x);
          };

          let distSoFar = 0;
          let idx = 0;
          let step = Math.max(1.2, brushDef.sp * 0.274 * brushDef.a1 * sc);

          const putStamp = (x: number, y: number, ang: number) => {
            const R = brushDef.a1 * sc;
            const r = Math.max(0.6, R * (1 + (hr(sd + idx * 3.1) - 0.5) * 0.4));
            const rot = (brushDef.f ? ang - (brushDef.vt ? Math.PI / 2 : 0) : 0) + (brushDef.g * Math.PI) / 180;
            ctx.globalAlpha = Math.max(0.05, Math.min(1, brushDef.o1 * (1 - brushDef.oj * 0.03 * hr(sd + idx * 9.1))));
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.scale(1, brushDef.q);
            ctx.drawImage(tinted, -r, -r, 2 * r, 2 * r);
            ctx.restore();
            idx++;
          };

          putStamp(p[0][0], p[0][1], p.length > 1 ? Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) : 0);
          let nextDist = step;

          for (let i = 1; i < p.length; i++) {
            const a = p[i - 1];
            const b = p[i];
            const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (!segLen) continue;
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);

            while (nextDist <= distSoFar + segLen) {
              const t = (nextDist - distSoFar) / segLen;
              putStamp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ang);
              nextDist += step * (1 + (hr(sd + idx * 2.3) - 0.5) * brushDef.sn * 0.5);
            }
            distSoFar += segLen;
          }
          ctx.restore();
          return;
        }
      }

      // Smooth Natural Ink Curve
      ctx.lineCap = ps.t === 'hl' ? 'butt' : 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ps.c;
      ctx.globalAlpha = ps.t === 'hl' ? 0.35 : (ps.v === 'pencil' ? 0.6 : ps.v === 'crayon' ? 0.75 : ps.v === 'marker' ? 0.7 : 1);
      ctx.lineWidth = ps.t === 'hl' ? ps.w * 4 : (ps.v === 'marker' ? ps.w * 2.4 : ps.w);

      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      if (p.length === 1) {
        ctx.lineTo(p[0][0] + 0.01, p[0][1]);
      }
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2;
        const my = (p[i][1] + p[i + 1][1]) / 2;
        ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
      }
      if (p.length > 1) {
        ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
      }
      ctx.stroke();

      // Additional texture passes for crayon/pencil
      if (ps.v === 'crayon' || ps.v === 'pencil') {
        ctx.setLineDash(ps.v === 'crayon' ? [1, 2, 3, 1.5] : [1, 3]);
        ctx.globalAlpha = ps.v === 'crayon' ? 0.4 : 0.3;
        ctx.lineWidth = ps.w * (ps.v === 'crayon' ? 2.6 : 1.5);
        ctx.stroke();
      }

      ctx.restore();
    },
    [getStrokeBounds]
  );

  // Full Page Render
  const renderPage = useCallback(
    (ctx: CanvasRenderingContext2D, page: Page, liveStroke?: any) => {
      renderBackground(ctx, page);
      page.strokes.forEach((s) => renderSingleStroke(ctx, s));
      if (liveStroke) {
        renderSingleStroke(ctx, liveStroke);
      }
    },
    [renderBackground, renderSingleStroke]
  );

  // Draw main canvas loop
  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    const live = s.cur && ['pen', 'hl', 'shape'].includes(s.cur.t) ? s.cur : null;

    renderPage(ctx, currentPage, live);

    // Render Laser Pointer Trail
    const now = performance.now();
    s.trail = s.trail.filter((pt) => now - pt[2] < 800);
    if (s.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < s.trail.length; i++) {
        const alpha = 1 - (now - s.trail[i][2]) / 800;
        ctx.strokeStyle = `rgba(255, 40, 40, ${alpha})`;
        ctx.lineWidth = 8 * alpha + 2;
        ctx.beginPath();
        ctx.moveTo(s.trail[i - 1][0], s.trail[i - 1][1]);
        ctx.lineTo(s.trail[i][0], s.trail[i][1]);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render Selection Marquee and Handles
    if (s.sel.length > 0) {
      const b = getSelectionBox();
      ctx.save();
      ctx.strokeStyle = '#2f6df6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(b[0] - 6, b[1] - 6, b[2] - b[0] + 12, b[3] - b[1] + 12);

      // Rotation Handle Stalk and Dot
      const hx = (b[0] + b[2]) / 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(hx, b[1] - 6);
      ctx.lineTo(hx, b[1] - 32);
      ctx.stroke();
      ctx.fillStyle = '#2f6df6';
      ctx.beginPath();
      ctx.arc(hx, b[1] - 32, 7, 0, 7);
      ctx.fill();

      // Corner Resize Handles
      const corners = [
        [b[0] - 6, b[1] - 6],
        [b[2] + 6, b[1] - 6],
        [b[0] - 6, b[3] + 6],
        [b[2] + 6, b[3] + 6],
      ];
      ctx.fillStyle = '#ffffff';
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, 7);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    // In-progress Lasso Polygon preview
    if (s.cur && s.cur.lp) {
      ctx.save();
      ctx.strokeStyle = '#2f6df6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      s.cur.lp.forEach((q: [number, number], i: number) => {
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      });
      ctx.fillStyle = 'rgba(47, 109, 246, 0.1)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [currentPage, renderPage, getSelectionBox]);
  drawRef.current = draw;

  // Pointer position helper
  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const cv = cvRef.current;
    if (!cv) return [0, 0];
    const r = cv.getBoundingClientRect();
    const pw = currentPage.pw || 800;
    const ph = currentPage.ph || 1100;
    return [((e.clientX - r.left) * pw) / r.width, ((e.clientY - r.top) * ph) / r.height];
  };

  // Live laser loop
  const startLaserLoop = useCallback(() => {
    const s = stateRef.current;
    if (s.lpLoop) return;
    s.lpLoop = true;
    const f = () => {
      draw();
      if (s.trail.length > 0) {
        requestAnimationFrame(f);
      } else {
        s.lpLoop = false;
      }
    };
    requestAnimationFrame(f);
  }, [draw]);

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.flipping) return;

    if (e.pointerType === 'pen' && !s.penSeen) {
      s.penSeen = true;
      setPenOnly(true);
    }
    if (penOnly && e.pointerType === 'touch') return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const [x, y] = getCanvasPos(e);

    // Commit existing active text editing
    if (s.textEditing) {
      commitText();
    }

    if (tool === 'laser') {
      s.cur = { t: 'laser' };
      s.trail.push([x, y, performance.now()]);
      startLaserLoop();
      return;
    }

    if (tool === 'text') {
      openTextEditor(x, y);
      return;
    }

    if (tool === 'sel') {
      snapUndo();
      s.cur = null;
      if (s.sel.length > 0) {
        const b = getSelectionBox();
        const hx = (b[0] + b[2]) / 2;
        // Rotation handle clicked?
        if (Math.hypot(x - hx, y - (b[1] - 32)) < 18) {
          const cy = (b[1] + b[3]) / 2;
          s.cur = {
            t: 'sel',
            rot: 1,
            cx: hx,
            cy,
            a0: Math.atan2(y - cy, x - hx),
            o: s.sel.map((item) => JSON.parse(JSON.stringify(item))),
          };
          return;
        }
        // Inside selection box for moving?
        if (x >= b[0] - 6 && x <= b[2] + 6 && y >= b[1] - 6 && y <= b[3] + 6) {
          s.cur = {
            t: 'sel',
            mv: 1,
            l: [x, y],
            tap: s.sel.length === 1 && s.sel[0].t === 'vid' ? s.sel[0] : null,
          };
          return;
        }
      }
      // Start new lasso selection
      s.sel = [];
      s.cur = {
        t: 'sel',
        lp: [[x, y]],
        rect: s.lassoRect,
        lp0: [x, y],
      };
      draw();
      return;
    }

    // Start drawing a stroke
    snapUndo();
    soundEngine.start(tool === 'pen' ? penType : tool === 'pe' ? 'er' : tool);
    s.lastP = [x, y, e.timeStamp];

    if (tool === 'er') {
      const it: any = { t: 'ers', ts: Date.now(), w: 2 * (8 + size * 1.2), p: [[x, y]] };
      currentPage.strokes.push(it);
      s.cur = { t: 'er', it, changed: true };
      draw();
    } else if (tool === 'pe') {
      // Stroke eraser: erase whole stroke
      s.cur = { t: 'er', changed: false };
      eraseWholeStrokeAt(x, y);
      draw();
    } else if (['line', 'rect', 'ell', 'arrow', 'hid', 'ax2', 'ax3'].includes(tool)) {
      s.cur = {
        t: 'shape',
        k: tool,
        c: color,
        w: size,
        ds: tool === 'hid' || s.dashOn,
        ac: [...s.axc],
        a: [x, y],
        b: [x, y],
      };
      draw();
    } else {
      // Pen or Highlighter
      s.cur = {
        t: tool,
        c: color,
        w: size,
        v: penType,
        sd: (Math.random() * 1e5) | 0,
        lt: performance.now(),
        p: [[x, y]],
      };
      draw();
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (!s.cur) return;

    const [x, y] = getCanvasPos(e);

    // Play sound on move
    if (s.lastP) {
      const dt = Math.max(1, e.timeStamp - s.lastP[2]);
      const dist = Math.hypot(x - s.lastP[0], y - s.lastP[1]);
      soundEngine.move(dist / dt);
      s.lastP = [x, y, e.timeStamp];
    }

    if (s.cur.t === 'laser') {
      s.trail.push([x, y, performance.now()]);
    } else if (s.cur.t === 'er') {
      if (s.cur.it) {
        const last = s.cur.it.p[s.cur.it.p.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) > 1.5) {
          s.cur.it.p.push([x, y]);
        }
      } else {
        eraseWholeStrokeAt(x, y);
      }
    } else if (s.cur.t === 'shape') {
      s.cur.b = [x, y];
    } else if (s.cur.t === 'sel') {
      if (s.cur.mv) {
        const dx = x - s.cur.l[0];
        const dy = y - s.cur.l[1];
        s.sel.forEach((item) => {
          if ((item as PenStroke).p) {
            (item as PenStroke).p = (item as PenStroke).p.map((pt) => [pt[0] + dx, pt[1] + dy]);
          }
          if ((item as ShapeStroke).a) {
            (item as ShapeStroke).a = [(item as ShapeStroke).a[0] + dx, (item as ShapeStroke).a[1] + dy];
            (item as ShapeStroke).b = [(item as ShapeStroke).b[0] + dx, (item as ShapeStroke).b[1] + dy];
          }
          if ((item as any).x !== undefined) {
            (item as any).x += dx;
            (item as any).y += dy;
          }
        });
        s.cur.l = [x, y];
      } else if (s.cur.rot) {
        const d = Math.atan2(y - s.cur.cy, x - s.cur.cx) - s.cur.a0;
        const cos = Math.cos(d);
        const sin = Math.sin(d);
        s.sel.forEach((item, idx) => {
          const orig = s.cur.o[idx];
          if ((orig as PenStroke).p) {
            (item as PenStroke).p = (orig as PenStroke).p.map((q) => {
              const rx = s.cur.cx + (q[0] - s.cur.cx) * cos - (q[1] - s.cur.cy) * sin;
              const ry = s.cur.cy + (q[0] - s.cur.cx) * sin + (q[1] - s.cur.cy) * cos;
              return [rx, ry];
            });
          }
          item.r = (orig.r || 0) + d;
        });
      } else if (s.cur.rect) {
        const a = s.cur.lp0;
        s.cur.lp = [
          [a[0], a[1]],
          [x, a[1]],
          [x, y],
          [a[0], y],
        ];
      } else {
        s.cur.lp.push([x, y]);
      }
    } else {
      // Pen / Highlighter stroke drawing
      const last = s.cur.p[s.cur.p.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) > 1.2) {
        s.cur.p.push([x, y]);
      }
    }

    draw();
  };

  // Pointer Up
  const handlePointerUp = () => {
    const s = stateRef.current;
    if (!s.cur) return;

    soundEngine.stop();

    if (s.cur.t === 'laser') {
      s.cur = null;
      return;
    }

    if (s.cur.t === 'sel') {
      if (s.cur.lp) {
        const pts = s.cur.lp;
        if (pts.length > 2) {
          s.sel = currentPage.strokes.filter((stroke) => {
            if (stroke.t === 'ers') return false;
            let checkPts: [number, number][] = [];
            if ((stroke as PenStroke).p) {
              checkPts = dens((stroke as PenStroke).p, 6) as [number, number][];
            } else if (stroke.t === 'shape') {
              const sh = stroke as ShapeStroke;
              checkPts = shapePts(sh.k, sh.a, sh.b);
            } else {
              const b = getStrokeBounds(stroke);
              checkPts = [
                [b[0], b[1]],
                [b[2], b[1]],
                [b[0], b[3]],
                [b[2], b[3]],
              ];
            }
            if (!checkPts.length) return false;
            let insideCount = 0;
            checkPts.forEach((q) => {
              if (inPoly(q, pts)) insideCount++;
            });
            return insideCount / checkPts.length >= 0.75;
          });
        }
      }
    } else if (s.cur.t === 'shape') {
      if (Math.hypot(s.cur.b[0] - s.cur.a[0], s.cur.b[1] - s.cur.a[1]) > 3) {
        currentPage.strokes.push({ ...s.cur });
      } else {
        s.undo.pop();
      }
    } else if (s.cur.t === 'pen' || s.cur.t === 'hl') {
      currentPage.strokes.push({ ...s.cur });
    }

    s.cur = null;
    draw();
    saveState();
  };

  // Erase whole stroke
  const eraseWholeStrokeAt = (x: number, y: number) => {
    const r = 12 + size;
    const initialLen = currentPage.strokes.length;
    currentPage.strokes = currentPage.strokes.filter((s) => {
      if (s.t === 'ers') return true;
      if ((s as PenStroke).p) {
        const sw = (s as PenStroke).w || 2;
        return !(s as PenStroke).p.some((q) => Math.hypot(q[0] - x, q[1] - y) < r + sw / 2);
      }
      const b = getStrokeBounds(s);
      return !(x >= b[0] - r && x <= b[2] + r && y >= b[1] - r && y <= b[3] + r);
    });
    return currentPage.strokes.length !== initialLen;
  };

  // Live text box
  const openTextEditor = (x: number, y: number) => {
    const s = stateRef.current;
    const tx = txRef.current;
    const cv = cvRef.current;
    if (!tx || !cv) return;

    const r = cv.getBoundingClientRect();
    const pw = currentPage.pw || 800;
    const scale = r.width / pw;

    s.textEditing = {
      x,
      y,
      s: 10 + size * 3,
      c: color,
      f: 'arial',
    };

    tx.style.display = 'block';
    tx.style.left = `${x * scale}px`;
    tx.style.top = `${y * scale}px`;
    tx.style.fontSize = `${(10 + size * 3) * scale}px`;
    tx.style.color = color;
    tx.style.width = '140px';
    tx.value = '';

    setTimeout(() => {
      tx.focus();
    }, 50);
  };

  const commitText = () => {
    const s = stateRef.current;
    const tx = txRef.current;
    if (!s.textEditing || !tx) return;

    const text = tx.value.trim();
    if (text) {
      snapUndo();
      const textStroke: TextStroke = {
        t: 'text',
        x: s.textEditing.x,
        y: s.textEditing.y,
        s: s.textEditing.s,
        c: s.textEditing.c,
        txt: text,
        f: s.textEditing.f,
      };
      currentPage.strokes.push(textStroke);
      saveState();
    }
    s.textEditing = null;
    tx.style.display = 'none';
    tx.value = '';
    draw();
  };

  // Page turns
  const goToPage = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= nb.pages.length || nextIndex === pi) return;
    setPi(nextIndex);
  };

  // Add Page
  const addPage = () => {
    const newPage: Page = {
      tpl: currentPage.tpl,
      col: currentPage.col,
      pw: currentPage.pw,
      ph: currentPage.ph,
      pp: currentPage.pp ? { ...currentPage.pp } : undefined,
      strokes: [],
    };
    nb.pages.splice(pi + 1, 0, newPage);
    setPi(pi + 1);
    saveState();
  };

  // Duplicate Page
  const duplicatePage = () => {
    const dup: Page = JSON.parse(JSON.stringify(currentPage));
    nb.pages.splice(pi + 1, 0, dup);
    setPi(pi + 1);
    saveState();
  };

  // Delete Page with double-tap confirmation
  const deletePage = () => {
    if (nb.pages.length < 2) {
      snapUndo();
      currentPage.strokes = [];
      draw();
      saveState();
      return;
    }
    if (!delArm) {
      setDelArm(true);
      setTimeout(() => setDelArm(false), 2500);
      return;
    }
    setDelArm(false);
    nb.pages.splice(pi, 1);
    setPi(Math.max(0, pi - 1));
    saveState();
  };

  // Print or PDF export
  const handlePrintPDF = () => {
    const prContainer = document.getElementById('pr');
    if (!prContainer) return;
    prContainer.innerHTML = '';
    const pw = currentPage.pw || 800;
    const ph = currentPage.ph || 1100;

    nb.pages.forEach((p) => {
      const c = document.createElement('canvas');
      c.width = (p.pw || pw) * 2;
      c.height = (p.ph || ph) * 2;
      const x = c.getContext('2d');
      if (x) {
        x.scale(2, 2);
        renderPage(x, p);
        const img = new Image();
        img.src = c.toDataURL('image/jpeg', 0.9);
        prContainer.appendChild(img);
      }
    });

    setTimeout(() => {
      window.print();
    }, 400);
  };

  // Image input handler with local MediaVault
  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const mediaId = await saveMediaItem(file, file.name, 'image');
      const url = await getMediaUrl(mediaId);
      if (!url) return;

      const img = new Image();
      img.onload = () => {
        const pw = currentPage.pw || 800;
        const w = Math.min(420, pw - 80);
        const h = (w * img.height) / img.width;
        snapUndo();
        const stroke: ImageStroke = {
          t: 'img',
          mediaId,
          src: url,
          x: (pw - w) / 2,
          y: 200,
          w,
          h,
        };
        currentPage.strokes.push(stroke);
        stateRef.current.sel = [stroke];
        setTool('sel');
        draw();
        saveState();
        showToast('Image safely saved to device vault');
      };
      img.src = url;
    } catch {
      showToast('Could not store image in device vault');
    }
  };

  // Video input handler with local MediaVault
  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const mediaId = await saveMediaItem(file, file.name, 'video');
      const url = await getMediaUrl(mediaId);
      if (!url) return;

      const pw = currentPage.pw || 800;
      const w = Math.min(420, pw - 80);
      const h = (w * 9) / 16;
      snapUndo();
      const stroke: VideoStroke = {
        t: 'vid',
        id: `v_${Date.now()}`,
        mediaId,
        src: url,
        x: (pw - w) / 2,
        y: 200,
        w,
        h,
      };
      currentPage.strokes.push(stroke);
      stateRef.current.sel = [stroke];
      setTool('sel');
      draw();
      saveState();
      showToast('Video safely saved to device vault');
    } catch {
      showToast('Could not store video in device vault');
    }
  };

  // Redraw when page or dimensions change
  useEffect(() => {
    updateLayout();
    draw();
  }, [pi, nb, updateLayout, draw]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      updateLayout();
      draw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateLayout, draw]);

  return (
    <div className="flex flex-col h-full w-full select-none" style={{ backgroundColor: 'var(--bg)', color: 'var(--tx)' }}>
      {/* Top Toolbar: Auto-Rearranges on Phone / Tablet / PC in Landscape & Portrait */}
      <div
        id="bar"
        className={`flex items-center gap-1 mx-2 mt-1.5 px-2 py-1 rounded-2xl border shadow-md flex-none overflow-x-auto ${
          viewport.deviceType === 'phone' && viewport.orientation === 'landscape'
            ? 'h-9 py-0.5'
            : ''
        }`}
        style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)' }}
      >
        <button
          onClick={onBackToLibrary}
          className="text-xs font-semibold px-2 py-1 flex-none"
          title="Back to library"
        >
          ‹ {viewport.deviceType === 'phone' ? '' : 'Library'}
        </button>

        <input
          type="text"
          value={nb.name}
          onChange={(e) => {
            nb.name = e.target.value;
            saveState();
          }}
          className={`font-semibold text-xs border-0 border-b px-1 focus:outline-none flex-none ${
            viewport.deviceType === 'phone' ? 'w-20 sm:w-28' : 'w-32'
          }`}
          style={{ borderColor: 'var(--bd)', backgroundColor: 'transparent', color: 'var(--tx)' }}
          placeholder="Title"
          aria-label="Notebook title"
        />

        <span className="sep"></span>

        {/* Brush Drawer Button */}
        <button
          onClick={(e) => {
            setTool('pen');
            setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
            setActiveDrawer((cur) => (cur === 'brush' ? null : 'brush'));
          }}
          className={`ic flex items-center gap-1 ${tool === 'pen' ? 'on' : ''}`}
          title="Brushes & Pens"
          aria-label="Brushes"
        >
          <Ico path={IC_PATHS.pen} />
          {viewport.deviceType !== 'phone' && <span className="text-xs font-semibold">Pen</span>}
        </button>

        {/* Highlighter */}
        <button
          onClick={() => {
            setTool('hl');
            setActiveDrawer(null);
          }}
          className={`ic flex items-center gap-1 ${tool === 'hl' ? 'on' : ''}`}
          title="Highlighter"
          aria-label="Highlighter"
        >
          <Ico path={IC_PATHS.hl} />
          {viewport.deviceType !== 'phone' && <span className="text-xs font-semibold">HL</span>}
        </button>

        {/* Eraser Drawer */}
        <button
          onClick={(e) => {
            if (tool !== 'er' && tool !== 'pe') setTool('er');
            setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
            setActiveDrawer((cur) => (cur === 'eraser' ? null : 'eraser'));
          }}
          className={`ic ${tool === 'er' || tool === 'pe' ? 'on' : ''}`}
          title="Erasers"
          aria-label="Erasers"
        >
          <Ico path={IC_PATHS.er} />
        </button>

        {/* Primary tools on Tablet / PC / Landscape Phone */}
        {(viewport.deviceType !== 'phone' || viewport.orientation === 'landscape') && (
          <>
            <button
              onClick={(e) => {
                setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                setActiveDrawer((cur) => (cur === 'shape' ? null : 'shape'));
              }}
              className={`ic ${['line', 'rect', 'ell', 'arrow', 'hid', 'ax2', 'ax3'].includes(tool) ? 'on' : ''}`}
              title="Shapes"
              aria-label="Shapes"
            >
              <Ico path={IC_PATHS.line} />
            </button>

            <button
              onClick={() => {
                setTool('text');
                setActiveDrawer(null);
              }}
              className={`ic ${tool === 'text' ? 'on' : ''}`}
              title="Text"
              aria-label="Text"
            >
              <Ico path={IC_PATHS.text} />
            </button>

            <button
              onClick={(e) => {
                setTool('sel');
                setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                setActiveDrawer((cur) => (cur === 'lasso' ? null : 'lasso'));
              }}
              className={`ic ${tool === 'sel' ? 'on' : ''}`}
              title="Selection"
              aria-label="Selection"
            >
              <Ico path={IC_PATHS.sel} />
            </button>

            <button
              onClick={(e) => {
                setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                setActiveDrawer((cur) => (cur === 'media' ? null : 'media'));
              }}
              className="ic"
              title="Insert Media"
              aria-label="Insert Media"
            >
              <Ico path={IC_PATHS.media} />
            </button>

            <button
              onClick={(e) => {
                setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                setActiveDrawer((cur) => (cur === 'symbols' ? null : 'symbols'));
              }}
              className="ic text-sm font-bold"
              title="Symbols"
              aria-label="Symbols"
            >
              Σ
            </button>
          </>
        )}

        <span className="sep"></span>

        {/* Color Palette: On phone portrait show compact active color picker, on tablet/PC show full palette */}
        {viewport.deviceType === 'phone' && viewport.orientation === 'portrait' ? (
          <div className="flex items-center gap-1 flex-none">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-5 h-5 p-0 border rounded-full cursor-pointer"
              title="Color"
              aria-label="Color"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-none">
            {COLORS.slice(0, viewport.deviceType === 'phone' ? 4 : 7).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`sw ${color === c ? 'on' : ''}`}
                style={{ backgroundColor: c, width: 20, height: 20 }}
                title={`Color ${c}`}
                aria-label={`Color ${c}`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-5 h-5 p-0 border rounded cursor-pointer"
              title="Custom color"
              aria-label="Custom color"
            />
          </div>
        )}

        {/* Size Slider on Tablet / PC */}
        {viewport.deviceType !== 'phone' && (
          <input
            type="range"
            min={1}
            max={24}
            value={size}
            onChange={(e) => setSize(+e.target.value)}
            className="w-14"
            title={`Size: ${size}px`}
            aria-label="Stroke size"
          />
        )}

        <span className="sep"></span>

        {/* Undo / Redo */}
        <button
          onClick={() => {
            const s = stateRef.current;
            if (s.undo.length === 0) return;
            s.redo.push(JSON.stringify(currentPage.strokes));
            currentPage.strokes = JSON.parse(s.undo.pop()!);
            s.sel = [];
            draw();
            saveState();
          }}
          className="ic"
          title="Undo"
          aria-label="Undo"
        >
          <Ico path={IC_PATHS.undo} />
        </button>
        <button
          onClick={() => {
            const s = stateRef.current;
            if (s.redo.length === 0) return;
            s.undo.push(JSON.stringify(currentPage.strokes));
            currentPage.strokes = JSON.parse(s.redo.pop()!);
            s.sel = [];
            draw();
            saveState();
          }}
          className="ic"
          title="Redo"
          aria-label="Redo"
        >
          <Ico path={IC_PATHS.redo} />
        </button>

        {/* Auto-Layout / Auto-Fit Feature button */}
        <button
          onClick={() => {
            const nextMode: Record<AutoFitMode, AutoFitMode> = {
              auto: 'fit-width',
              'fit-width': 'fit-height',
              'fit-height': 'actual',
              actual: 'auto',
            };
            const next = nextMode[autoFitMode];
            setAutoFitMode(next);
            showToast(
              next === 'auto'
                ? 'Auto Layout (Adaptive)'
                : next === 'fit-width'
                ? 'Fit Width'
                : next === 'fit-height'
                ? 'Fit Height'
                : '100% Size'
            );
          }}
          className={`px-2 py-0.5 rounded-lg text-xs font-semibold border flex items-center gap-1 flex-none ${
            autoFitMode === 'auto' ? 'on' : ''
          }`}
          style={
            autoFitMode === 'auto'
              ? { backgroundColor: 'var(--ac)', color: '#fff', borderColor: 'var(--ac)' }
              : { borderColor: 'var(--bd)' }
          }
          title={`Layout: ${autoFitMode}. Click to switch.`}
          aria-label="Auto Layout Mode"
        >
          <span>📐</span>
          <span className="text-[11px] font-mono">
            {autoFitMode === 'auto'
              ? 'Auto'
              : autoFitMode === 'fit-width'
              ? 'Fit ↔'
              : autoFitMode === 'fit-height'
              ? 'Fit ↕'
              : '100%'}
          </span>
        </button>

        {/* Zoom & Extras on Tablet / PC */}
        {viewport.deviceType !== 'phone' && (
          <>
            <button
              onClick={() => {
                setAutoFitMode('actual');
                stateRef.current.zoom = Math.max(0.4, stateRef.current.zoom / 1.2);
                updateLayout();
                draw();
              }}
              className="ic text-xs font-bold"
              title="Zoom Out"
              aria-label="Zoom out"
            >
              🔍−
            </button>
            <button
              onClick={() => {
                setAutoFitMode('actual');
                stateRef.current.zoom = Math.min(3.0, stateRef.current.zoom * 1.2);
                updateLayout();
                draw();
              }}
              className="ic text-xs font-bold"
              title="Zoom In"
              aria-label="Zoom in"
            >
              🔍+
            </button>

            <button
              onClick={() => setShowThumbs((v) => !v)}
              className={`ic ${showThumbs ? 'on' : ''}`}
              title="Thumbnails"
              aria-label="Thumbnails"
            >
              <Ico path={IC_PATHS.thumbnails} />
            </button>

            <button
              onClick={(e) => {
                setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                setActiveDrawer((cur) => (cur === 'paper' ? null : 'paper'));
              }}
              className="ic"
              title="Paper Style"
              aria-label="Paper"
            >
              <Ico path={IC_PATHS.paper} />
            </button>

            <button onClick={handlePrintPDF} className="ic" title="PDF" aria-label="Export PDF">
              <Ico path={IC_PATHS.print} />
            </button>

            <button
              onClick={(e) => {
                setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                setActiveDrawer((cur) => (cur === 'settings' ? null : 'settings'));
              }}
              className="ic"
              title="Settings"
              aria-label="Settings"
            >
              <Ico path={IC_PATHS.settings} />
            </button>
          </>
        )}

        {/* Mobile More Button (Phone Portrait) */}
        {viewport.deviceType === 'phone' && viewport.orientation === 'portrait' && (
          <button
            onClick={() => setShowMobileMore((v) => !v)}
            className={`px-2 py-1 rounded-lg text-xs font-bold border ml-auto flex-none ${
              showMobileMore ? 'on' : ''
            }`}
            style={{ borderColor: 'var(--bd)' }}
            title="More Tools"
            aria-label="More Tools"
          >
            ⋯ More
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div id="main" className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Thumbnails Sidebar */}
        {showThumbs && (
          <div
            id="side"
            className="w-28 overflow-y-auto p-2 border-r flex flex-col gap-2 flex-none"
            style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)' }}
          >
            {nb.pages.map((p, idx) => (
              <div
                key={idx}
                onClick={() => goToPage(idx)}
                className={`cursor-pointer rounded border-2 p-0.5 transition ${
                  idx === pi ? 'border-blue-500 shadow-sm' : 'border-gray-200 dark:border-gray-700'
                }`}
                style={{ backgroundColor: p.col || '#fff' }}
              >
                <div className="aspect-[3/4] flex items-center justify-center text-xs font-bold text-gray-400">
                  Page {idx + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stage and Drawing Canvas */}
        <div id="stage" ref={stageRef} className="flex-1 overflow-auto p-4 flex items-start justify-center">
          <div id="wrap" ref={wrapRef} className="relative flex-none shadow-xl">
            <canvas
              id="cv"
              ref={cvRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="block w-full cursor-crosshair rounded"
              style={{ touchAction: penOnly ? 'pan-x pan-y pinch-zoom' : 'none' }}
            />

            {/* In-Canvas Textbox Overlay */}
            <textarea
              id="tx"
              ref={txRef}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Escape') commitText();
              }}
              className="absolute hidden bg-yellow-100/60 border border-dashed border-blue-500 outline-none resize-none p-1 leading-tight overflow-hidden rounded"
              aria-label="Canvas text box"
            />
          </div>
        </div>
      </div>

      {/* Floating Selection Bar */}
      {stateRef.current.sel.length > 0 && (
        <div
          id="sbar"
          className="fixed bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 px-3 rounded-2xl border shadow-xl z-30"
          style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)' }}
        >
          <button
            onClick={() => {
              const b = getSelectionBox();
              const w = b[2] - b[0];
              const h = b[3] - b[1];
              const copy = JSON.parse(JSON.stringify(stateRef.current.sel));
              copy.forEach((item: any) => {
                if (item.p) item.p = item.p.map((pt: [number, number]) => [pt[0] + 20, pt[1] + 20]);
                if (item.a) {
                  item.a = [item.a[0] + 20, item.a[1] + 20];
                  item.b = [item.b[0] + 20, item.b[1] + 20];
                }
                if (item.x !== undefined) {
                  item.x += 20;
                  item.y += 20;
                }
              });
              snapUndo();
              currentPage.strokes.push(...copy);
              stateRef.current.sel = copy;
              draw();
              saveState();
            }}
            className="text-xs px-2 py-1 rounded"
          >
            Duplicate
          </button>

          <button
            onClick={() => {
              const b = getSelectionBox();
              const copy = JSON.parse(JSON.stringify(stateRef.current.sel));
              copy.forEach((item: any) => {
                if (item.p) item.p = item.p.map((pt: [number, number]) => [pt[0] - b[0], pt[1] - b[1]]);
                if (item.a) {
                  item.a = [item.a[0] - b[0], item.a[1] - b[1]];
                  item.b = [item.b[0] - b[0], item.b[1] - b[1]];
                }
                if (item.x !== undefined) {
                  item.x -= b[0];
                  item.y -= b[1];
                }
              });
              const fig: FigureItem = {
                id: Date.now(),
                w: b[2] - b[0],
                h: b[3] - b[1],
                items: copy,
              };
              (nb.lib = nb.lib || []).push(fig);
              saveState();
              showToast('Saved to this notebook’s figure library');
            }}
            className="text-xs px-2 py-1 rounded"
          >
            Save Figure
          </button>

          <button
            onClick={() => {
              snapUndo();
              currentPage.strokes = currentPage.strokes.filter((s) => !stateRef.current.sel.includes(s));
              stateRef.current.sel = [];
              draw();
              saveState();
            }}
            className="text-xs px-2 py-1 rounded text-red-500 font-semibold"
          >
            Delete
          </button>
        </div>
      )}

      {/* Bottom Page Navigation Bar: Responsive on Phone / Tablet / PC */}
      <div
        id="pg"
        className={`flex items-center justify-center gap-2 p-1.5 border-t flex-none ${
          viewport.deviceType === 'phone' && viewport.orientation === 'landscape' ? 'h-8 py-0.5' : ''
        }`}
        style={{ backgroundColor: 'var(--sf)', borderColor: 'var(--bd)' }}
      >
        <button onClick={() => goToPage(pi - 1)} disabled={pi === 0} className="px-2 py-0.5 text-xs font-semibold">
          ‹
        </button>
        <span id="pn" className="text-xs font-semibold">
          {pi + 1} / {nb.pages.length}
        </span>
        <button
          onClick={() => goToPage(pi + 1)}
          disabled={pi === nb.pages.length - 1}
          className="px-2 py-0.5 text-xs font-semibold"
        >
          ›
        </button>

        <span className="sep"></span>

        <button onClick={addPage} className="px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
          + Page
        </button>
        <button onClick={duplicatePage} className="px-2 py-0.5 text-xs font-semibold">
          Duplicate
        </button>
        <button onClick={deletePage} className={`px-2 py-0.5 text-xs font-semibold ${delArm ? 'text-red-600 font-bold' : ''}`}>
          {delArm ? 'Sure?' : 'Delete'}
        </button>
      </div>

      {/* Hidden Media Inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFile} />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageFile}
      />
      <input
        ref={fontInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const buf = await file.arrayBuffer();
            const fontName = file.name.replace(/\.[^.]+$/, '');
            const fontFace = new FontFace(fontName, buf);
            await fontFace.load();
            document.fonts.add(fontFace);
            FONTS[fontName.toLowerCase()] = [fontName, `'${fontName}', sans-serif`];
            showToast(`Loaded font: ${fontName}`);
          } catch {
            showToast('Could not load font file');
          }
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Mobile More Sheet / Drawer (Phone Portrait) */}
      {showMobileMore && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 bg-black/40 backdrop-blur-xs"
          onClick={() => setShowMobileMore(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-4 shadow-2xl flex flex-col gap-3 max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--bd)' }}>
              <div className="font-bold text-sm">Tools &amp; Settings</div>
              <button
                onClick={() => setShowMobileMore(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-600 border-0"
              >
                ✕
              </button>
            </div>

            {/* Stroke Width Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>Stroke Size</span>
                <span className="font-mono text-[11px]">{size}px</span>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                value={size}
                onChange={(e) => setSize(+e.target.value)}
                className="w-full"
              />
            </div>

            {/* Stylus Pressure */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Pressure</span>
              <select
                value={pressureMode}
                onChange={(e) => setPressureMode(e.target.value as StylusPressure)}
                className="text-xs p-1 rounded border"
                style={{ borderColor: 'var(--bd)' }}
              >
                <option value="1">Normal</option>
                <option value=".6">Soft</option>
                <option value="1.7">Firm</option>
                <option value="off">Off</option>
              </select>
            </div>

            {/* Additional Tools Grid */}
            <div className="grid grid-cols-4 gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--bd)' }}>
              <button
                onClick={(e) => {
                  setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                  setActiveDrawer('shape');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.line} />
                <span>Shapes</span>
              </button>

              <button
                onClick={() => {
                  setTool('text');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.text} />
                <span>Text</span>
              </button>

              <button
                onClick={(e) => {
                  setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                  setActiveDrawer('lasso');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.sel} />
                <span>Lasso</span>
              </button>

              <button
                onClick={() => {
                  setTool('bk');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.bk} />
                <span>Fill</span>
              </button>

              <button
                onClick={() => {
                  setTool('laser');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.laser} />
                <span>Laser</span>
              </button>

              <button
                onClick={(e) => {
                  setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                  setActiveDrawer('media');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.media} />
                <span>Media</span>
              </button>

              <button
                onClick={(e) => {
                  setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                  setActiveDrawer('symbols');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <span className="font-bold text-base">Σ</span>
                <span>Symbols</span>
              </button>

              <button
                onClick={(e) => {
                  setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                  setActiveDrawer('paper');
                  setShowMobileMore(false);
                }}
                className="p-2 border rounded-xl flex flex-col items-center gap-1 text-[11px]"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.paper} />
                <span>Paper</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--bd)' }}>
              <button
                onClick={() => {
                  setShowThumbs((v) => !v);
                  setShowMobileMore(false);
                }}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.thumbnails} size={15} />
                <span>Pages</span>
              </button>

              <button
                onClick={() => {
                  handlePrintPDF();
                  setShowMobileMore(false);
                }}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.print} size={15} />
                <span>PDF</span>
              </button>

              <button
                onClick={(e) => {
                  setDrawerAnchorRect(e.currentTarget.getBoundingClientRect());
                  setActiveDrawer('settings');
                  setShowMobileMore(false);
                }}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1"
                style={{ borderColor: 'var(--bd)' }}
              >
                <Ico path={IC_PATHS.settings} size={15} />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Active Drawer */}
      {activeDrawer && drawerAnchorRect && (
        <div
          className="fixed z-40 p-3 rounded-2xl border shadow-2xl max-w-sm max-h-[60vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--sf)',
            borderColor: 'var(--bd)',
            color: 'var(--tx)',
            top: Math.min(window.innerHeight - 300, drawerAnchorRect.bottom + 8),
            left: Math.max(8, Math.min(window.innerWidth - 320, drawerAnchorRect.left)),
          }}
        >
          {/* Media / Insert Drawer */}
          {activeDrawer === 'media' && (
            <div className="space-y-1.5 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Insert Media</div>
              <button
                onClick={() => {
                  imageInputRef.current?.click();
                  setActiveDrawer(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <span>🖼️</span>
                <span>Gallery Photo</span>
              </button>
              <button
                onClick={() => {
                  cameraInputRef.current?.click();
                  setActiveDrawer(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <span>📷</span>
                <span>Camera Photo</span>
              </button>
              <button
                onClick={() => {
                  videoInputRef.current?.click();
                  setActiveDrawer(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <span>🎥</span>
                <span>Video Clip</span>
              </button>
              <button
                onClick={() => {
                  fontInputRef.current?.click();
                  setActiveDrawer(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <span>🔤</span>
                <span>Custom Font</span>
              </button>
              <button
                onClick={() => {
                  onOpenGallery();
                  setActiveDrawer(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 border-t pt-1.5"
              >
                <span>🗄️</span>
                <span className="font-semibold text-blue-600">Media Vault</span>
              </button>
            </div>
          )}

          {/* Paper Drawer */}
          {activeDrawer === 'paper' && (
            <div className="space-y-3 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Page Size</div>
              <div className="grid grid-cols-2 gap-1.5">
                {SIZES.map((sz) => (
                  <button
                    key={sz.name}
                    onClick={() => {
                      currentPage.pw = sz.width;
                      currentPage.ph = sz.height;
                      updateLayout();
                      draw();
                      saveState();
                    }}
                    className="p-1.5 border rounded text-left"
                    style={{ borderColor: 'var(--bd)' }}
                  >
                    <div className="font-semibold">{sz.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {sz.width}×{sz.height}
                    </div>
                  </button>
                ))}
              </div>

              <div className="font-bold text-gray-500 pt-2 border-t">Paper Template</div>
              <div className="grid grid-cols-3 gap-1">
                {['blank', 'lined', 'grid', 'dot', 'cornell'].map((tpl) => (
                  <button
                    key={tpl}
                    onClick={() => {
                      currentPage.tpl = tpl;
                      delete currentPage.pp;
                      draw();
                      saveState();
                    }}
                    className={`p-1.5 border rounded text-center capitalize ${
                      currentPage.tpl === tpl && !currentPage.pp ? 'border-blue-500 font-bold' : ''
                    }`}
                    style={{ borderColor: 'var(--bd)' }}
                  >
                    {tpl}
                  </button>
                ))}
              </div>

              <div className="font-bold text-gray-500 pt-2 border-t">Specialty Papers</div>
              <div className="grid grid-cols-2 gap-1.5">
                {READY_MADE_PAPERS.map((rp) => (
                  <button
                    key={rp.name}
                    onClick={() => {
                      currentPage.pp = { ...rp.config };
                      if (calculateLuminance(rp.config.bg || '#ffffff') < 0.35) {
                        setColor('#ffffff');
                      }
                      draw();
                      saveState();
                    }}
                    className="p-1.5 border rounded text-left flex items-center gap-1.5"
                    style={{ borderColor: 'var(--bd)' }}
                  >
                    <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: rp.config.bg || '#fff' }} />
                    <span className="truncate">{rp.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Symbols Drawer */}
          {activeDrawer === 'symbols' && (
            <div className="space-y-3 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Engineering &amp; Math Symbols</div>
              {Object.entries(SYM).map(([cat, list]) => (
                <div key={cat}>
                  <div className="font-semibold text-gray-400 mb-1">{cat}</div>
                  <div className="flex flex-wrap gap-1">
                    {list.split(' ').map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const tx = txRef.current;
                          if (stateRef.current.textEditing && tx) {
                            tx.value += s;
                          } else {
                            snapUndo();
                            const pw = currentPage.pw || 800;
                            const textStroke: TextStroke = {
                              t: 'text',
                              x: pw / 2 - 20,
                              y: 300,
                              s: 10 + size * 3,
                              c: color,
                              txt: s,
                              f: 'arial',
                            };
                            currentPage.strokes.push(textStroke);
                            stateRef.current.sel = [textStroke];
                            setTool('sel');
                            draw();
                            saveState();
                          }
                        }}
                        className="px-1.5 py-0.5 border rounded hover:border-blue-500"
                        style={{ borderColor: 'var(--bd)' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Brush Drawer */}
          {activeDrawer === 'brush' && (
            <div className="space-y-2 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Classic Pens</div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  ['ball', 'Ballpoint'],
                  ['fountain', 'Fountain'],
                  ['brush', 'Brush Pen'],
                  ['pencil', 'Pencil'],
                  ['crayon', 'Crayon'],
                  ['marker', 'Marker'],
                ].map(([v, n]) => (
                  <button
                    key={v}
                    onClick={() => {
                      setPenType(v);
                      setActiveDrawer(null);
                    }}
                    className={`p-1.5 border rounded text-left ${penType === v ? 'border-blue-500 font-bold' : ''}`}
                    style={{ borderColor: 'var(--bd)' }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="font-bold text-gray-500 pt-2 border-t">Art &amp; Calligraphy Stamps</div>
              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                {BRD.filter((b) => b.t).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setPenType(b.id);
                      setActiveDrawer(null);
                    }}
                    className={`p-1.5 border rounded text-left truncate ${
                      penType === b.id ? 'border-blue-500 font-bold' : ''
                    }`}
                    style={{ borderColor: 'var(--bd)' }}
                  >
                    {b.n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Eraser Drawer */}
          {activeDrawer === 'eraser' && (
            <div className="space-y-1.5 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Erasers</div>
              <button
                onClick={() => {
                  setTool('er');
                  setActiveDrawer(null);
                }}
                className={`w-full text-left p-2 border rounded ${tool === 'er' ? 'border-blue-500 font-bold' : ''}`}
                style={{ borderColor: 'var(--bd)' }}
              >
                <div className="font-semibold">Ink Eraser</div>
              </button>
              <button
                onClick={() => {
                  setTool('pe');
                  setActiveDrawer(null);
                }}
                className={`w-full text-left p-2 border rounded ${tool === 'pe' ? 'border-blue-500 font-bold' : ''}`}
                style={{ borderColor: 'var(--bd)' }}
              >
                <div className="font-semibold">Stroke Eraser</div>
              </button>
            </div>
          )}

          {/* Shapes Drawer */}
          {activeDrawer === 'shape' && (
            <div className="space-y-2 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Shapes</div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  ['line', 'Line'],
                  ['arrow', 'Arrow'],
                  ['rect', 'Rectangle'],
                  ['ell', 'Oval'],
                  ['ax2', 'X–Y Axes'],
                  ['ax3', 'X–Y–Z Axes'],
                  ['hid', 'Hidden Line'],
                ].map(([k, n]) => (
                  <button
                    key={k}
                    onClick={() => {
                      setTool(k as ToolType);
                      setActiveDrawer(null);
                    }}
                    className={`p-1.5 border rounded text-left ${tool === k ? 'border-blue-500 font-bold' : ''}`}
                    style={{ borderColor: 'var(--bd)' }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={stateRef.current.dashOn}
                  onChange={(e) => {
                    stateRef.current.dashOn = e.target.checked;
                  }}
                />
                <span>Dashed outline</span>
              </label>
            </div>
          )}

          {/* Settings Drawer */}
          {activeDrawer === 'settings' && (
            <div className="space-y-3 text-xs">
              <div className="font-bold text-gray-500 pb-1 border-b">Settings</div>
              <label className="flex items-center justify-between">
                <span>Page turn animation</span>
                <input
                  type="checkbox"
                  checked={stateRef.current.pageFlipAnimation}
                  onChange={(e) => {
                    stateRef.current.pageFlipAnimation = e.target.checked;
                    localStorage.setItem('inkpad-set', JSON.stringify({ flip: e.target.checked }));
                  }}
                />
              </label>

              <label className="flex items-center justify-between">
                <span>Pen only mode</span>
                <input type="checkbox" checked={penOnly} onChange={(e) => setPenOnly(e.target.checked)} />
              </label>

              <div className="border-t pt-2 space-y-1">
                <button
                  onClick={() => {
                    onOpenPermissions();
                    setActiveDrawer(null);
                  }}
                  className="w-full text-left py-1 text-blue-600 font-semibold"
                >
                  🛡️ Permissions &amp; Storage
                </button>
                <button
                  onClick={() => {
                    onOpenPrivacyPolicy();
                    setActiveDrawer(null);
                  }}
                  className="w-full text-left py-1 text-gray-600 dark:text-gray-300"
                >
                  📜 Privacy Policy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
