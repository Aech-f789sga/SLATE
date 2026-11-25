/**
 * Pure state, colour-math, and selection-restyling helpers for Color Fill
 * (both Paint Bucket flood fills and closed Shape fills).
 */

export const FILL_STORAGE_KEY = 'inkpad-fill-style';
export const MIN_FILL_OPACITY = 0.05;
export const MAX_FILL_OPACITY = 1;
export const DEFAULT_FILL_COLOR = '#2f6df6';

export const FILL_SWATCHES = [
  '#111111',
  '#f24d5c',
  '#f7a1c4',
  '#5aa9f5',
  '#a8c94a',
  '#9b5de5',
] as const;

export const FILLABLE_SHAPE_KINDS = new Set([
  'rect',
  'ell',
  'tri',
  'square',
  'circle',
  'rhomb',
  'para',
  'trap',
  'poly',
]);

export interface FillState {
  color: string;
  opacity: number;
}

export function normalizeHexColor(hex: unknown, fallback = DEFAULT_FILL_COLOR): string {
  if (typeof hex !== 'string') return fallback;
  const trimmed = hex.trim();
  const six = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  if (six) return '#' + six[1].toLowerCase();
  const three = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (three) {
    const [r, g, b] = three[1].toLowerCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function clampFillOpacity(v: unknown, fallback = MAX_FILL_OPACITY): number {
  const num = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(MIN_FILL_OPACITY, Math.min(MAX_FILL_OPACITY, num));
  return Math.round(clamped * 100) / 100;
}

export function formatOpacityPercent(opacity: unknown): string {
  const clamped = clampFillOpacity(opacity, 1);
  return `${Math.round(clamped * 100)}%`;
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const norm = normalizeHexColor(hex);
  return [
    parseInt(norm.slice(1, 3), 16),
    parseInt(norm.slice(3, 5), 16),
    parseInt(norm.slice(5, 7), 16),
  ];
}

export function hexToRgba(hex: string, opacity: unknown): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const a = clampFillOpacity(opacity, 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function parseFillState(raw: string | null | undefined, fallbackColor = DEFAULT_FILL_COLOR): FillState {
  const safeColor = normalizeHexColor(fallbackColor, DEFAULT_FILL_COLOR);
  if (!raw) return { color: safeColor, opacity: MAX_FILL_OPACITY };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { color: safeColor, opacity: MAX_FILL_OPACITY };
    return {
      color: normalizeHexColor((parsed as { color?: unknown }).color, safeColor),
      opacity: clampFillOpacity((parsed as { opacity?: unknown }).opacity, MAX_FILL_OPACITY),
    };
  } catch {
    return { color: safeColor, opacity: MAX_FILL_OPACITY };
  }
}

export function serializeFillState(state: FillState): string {
  return JSON.stringify({
    color: normalizeHexColor(state.color),
    opacity: clampFillOpacity(state.opacity),
  });
}

export function isFillableShape(
  s: { t?: string; k?: string; poly?: unknown; el?: unknown } | null | undefined,
): boolean {
  if (!s) return false;
  if (s.t && s.t !== 'shape') return false;
  if (s.k && FILLABLE_SHAPE_KINDS.has(s.k)) return true;
  return Boolean(s.poly || s.el);
}

export function isFillStroke(s: { t?: string; fl?: unknown } | null | undefined): boolean {
  return Boolean(s && s.t === 'img' && s.fl);
}

/**
 * Updates RGB channels of every visible pixel in an ImageData buffer to `hex`
 * while keeping existing alpha values intact so anti-aliased edges stay smooth.
 */
export function recolorImageDataPreservingAlpha(data: Uint8ClampedArray, hex: string): boolean {
  const [r, g, b] = hexToRgbTuple(hex);
  let changed = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      changed = true;
    }
  }
  return changed;
}

export function applyShapeOpacityToSelection(strokes: any[], opacity: number): boolean {
  const op = clampFillOpacity(opacity, 1);
  let changed = false;
  for (const s of strokes) {
    if (!s || s.t !== 'shape' || !isFillableShape(s) || !s.fc) continue;
    if (s.fop !== op) {
      s.fop = op;
      changed = true;
    }
  }
  return changed;
}

export function applyBucketOpacityToSelection(strokes: any[], opacity: number): boolean {
  const op = clampFillOpacity(opacity, 1);
  let changed = false;
  for (const s of strokes) {
    if (!s) continue;
    if (isFillStroke(s)) {
      const nextOp = op >= 0.999 ? undefined : op;
      if (s.op !== nextOp) {
        if (nextOp === undefined) delete s.op;
        else s.op = nextOp;
        changed = true;
      }
    } else if (s.t === 'shape' && isFillableShape(s) && s.fc) {
      if (s.fop !== op) {
        s.fop = op;
        changed = true;
      }
    }
  }
  return changed;
}
