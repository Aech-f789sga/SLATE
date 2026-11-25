export interface SheetRect {
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  pw: number;
  ph: number;
}

export type BBox = [number, number, number, number];

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

export interface CrossPageTransform {
  scaleX: number;
  scaleY: number;
  /** Map a single point from source page coordinates to target page coordinates. */
  mapPoint: (x: number, y: number) => [number, number];
  /** Target bounding box after exact screen mapping and minimal off-page visibility clamp. */
  dstBox: BBox;
  /** Clamping offset applied in target page units so a dropped item isn't wholly outside the page. */
  clampDx: number;
  clampDy: number;
}

/**
 * Convert a page-space bounding box on `srcRect` to viewport CSS pixel coordinates.
 */
export function selectionScreenBox(srcRect: SheetRect, box: BBox): ScreenBox {
  const sw = Math.max(1, srcRect.pw);
  const sh = Math.max(1, srcRect.ph);
  const left = srcRect.left + (box[0] / sw) * srcRect.width;
  const right = srcRect.left + (box[2] / sw) * srcRect.width;
  const top = srcRect.top + (box[1] / sh) * srcRect.height;
  const bottom = srcRect.top + (box[3] / sh) * srcRect.height;
  return {
    left,
    top,
    right,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
}

/**
 * Decide which sheet in Long-strip mode should receive a dragged selection.
 *
 * Uses vertical screen overlap first (so a figure dragged over a page break
 * lands on whichever page holds most of it), with selection center containment
 * and pointer Y containment as tie-breakers, and nearest-sheet distance when
 * dropped inside a gap or past the outer edges of the strip.
 */
export function resolveDropTarget(
  sheets: SheetRect[],
  srcIndex: number,
  srcBox: BBox,
  pointerClientY?: number | null
): number {
  if (!sheets.length) return srcIndex;
  const srcRect = sheets.find((s) => s.index === srcIndex);
  if (!srcRect) return srcIndex;

  const sb = selectionScreenBox(srcRect, srcBox);
  const boxH = Math.max(1, sb.bottom - sb.top);

  let bestIdx = srcIndex;
  let bestScore = -1;

  for (const sh of sheets) {
    const ov = Math.max(0, Math.min(sb.bottom, sh.bottom) - Math.max(sb.top, sh.top));
    if (ov <= 0) continue;
    let score = ov / boxH;
    // Center inside a sheet gets a small bias so near-even splits follow the visual center.
    if (sb.cy >= sh.top && sb.cy <= sh.bottom) score += 0.08;
    // Pointer inside a different sheet adds a tie-break nudge when overlap is close.
    if (pointerClientY != null && pointerClientY >= sh.top && pointerClientY <= sh.bottom) {
      score += 0.04;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = sh.index;
    }
  }

  if (bestScore > 0) return bestIdx;

  // No overlap with any sheet (e.g. dropped strictly inside a gap or past top/bottom of strip).
  if (pointerClientY != null) {
    const underPtr = sheets.find((sh) => pointerClientY >= sh.top && pointerClientY <= sh.bottom);
    if (underPtr) return underPtr.index;
  }

  let nearestIdx = srcIndex;
  let nearestDist = Infinity;
  for (const sh of sheets) {
    const dist = sb.cy < sh.top ? sh.top - sb.cy : sb.cy > sh.bottom ? sb.cy - sh.bottom : 0;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = sh.index;
    }
  }
  return nearestIdx;
}

/**
 * Compute coordinate mapping from `srcRect` (source page) to `dstRect` (target page)
 * so the dragged object stays at the exact screen pixel location where it was released.
 * Only if the entire object would sit outside the target page bounds is it nudged
 * minimally onto the visible page edge.
 */
export function mapCrossPageTransform(
  srcRect: SheetRect,
  dstRect: SheetRect,
  srcBox: BBox
): CrossPageTransform {
  const srcPw = Math.max(1, srcRect.pw);
  const srcPh = Math.max(1, srcRect.ph);
  const dstPw = Math.max(1, dstRect.pw);
  const dstPh = Math.max(1, dstRect.ph);
  const srcW = Math.max(1, srcRect.width);
  const srcH = Math.max(1, srcRect.height);
  const dstW = Math.max(1, dstRect.width);
  const dstH = Math.max(1, dstRect.height);

  const scaleX = (srcW / srcPw) / (dstW / dstPw);
  const scaleY = (srcH / srcPh) / (dstH / dstPh);

  const rawMap = (x: number, y: number): [number, number] => {
    const sx = srcRect.left + (x / srcPw) * srcW;
    const sy = srcRect.top + (y / srcPh) * srcH;
    const nx = ((sx - dstRect.left) / dstW) * dstPw;
    const ny = ((sy - dstRect.top) / dstH) * dstPh;
    return [nx, ny];
  };

  const [dx0, dy0] = rawMap(srcBox[0], srcBox[1]);
  const [dx1, dy1] = rawMap(srcBox[2], srcBox[3]);
  const minX = Math.min(dx0, dx1);
  const maxX = Math.max(dx0, dx1);
  const minY = Math.min(dy0, dy1);
  const maxY = Math.max(dy0, dy1);

  let clampDx = 0;
  let clampDy = 0;
  const minVisibleX = Math.min(24, Math.max(4, (maxX - minX) * 0.5));
  const minVisibleY = Math.min(24, Math.max(4, (maxY - minY) * 0.5));

  if (maxX < minVisibleX) clampDx = minVisibleX - maxX;
  else if (minX > dstPw - minVisibleX) clampDx = dstPw - minVisibleX - minX;

  if (maxY < minVisibleY) clampDy = minVisibleY - maxY;
  else if (minY > dstPh - minVisibleY) clampDy = dstPh - minVisibleY - minY;

  return {
    scaleX,
    scaleY,
    clampDx,
    clampDy,
    dstBox: [minX + clampDx, minY + clampDy, maxX + clampDx, maxY + clampDy],
    mapPoint: (x: number, y: number): [number, number] => {
      const [nx, ny] = rawMap(x, y);
      return [nx + clampDx, ny + clampDy];
    },
  };
}

/**
 * Determine whether a user scroll event has moved far enough away from an
 * explicitly clicked or newly added page to release the active-page pin.
 */
export function shouldReleaseScrollPin(
  pinnedPage: number | null,
  currentScrollTop: number,
  pinnedScrollTop: number,
  threshold = 48
): boolean {
  if (pinnedPage === null) return true;
  return Math.abs(currentScrollTop - pinnedScrollTop) >= threshold;
}

/**
 * Compute gentle vertical auto-scroll velocity (CSS px per frame) when dragging
 * near the top or bottom edge of the stage viewport.
 */
export function computeAutoScrollStep(
  pointerClientY: number | null,
  stageTop: number,
  stageBottom: number,
  edgeMargin = 48,
  maxStep = 14
): number {
  if (pointerClientY == null || stageBottom <= stageTop) return 0;
  if (pointerClientY < stageTop + edgeMargin) {
    const ratio = Math.min(1, Math.max(0, (stageTop + edgeMargin - pointerClientY) / edgeMargin));
    return -Math.round(Math.max(2, ratio * maxStep));
  }
  if (pointerClientY > stageBottom - edgeMargin) {
    const ratio = Math.min(1, Math.max(0, (pointerClientY - (stageBottom - edgeMargin)) / edgeMargin));
    return Math.round(Math.max(2, ratio * maxStep));
  }
  return 0;
}

/**
 * Decide whether the in-memory copied-figure buffer can be used as a fallback
 * when a paste event arrives without external media, text, HTML, or custom MIME.
 */
export function canUseInternalFigFallback(opts: {
  hasCustomMime: boolean;
  hasMediaFiles: boolean;
  plainText: string;
  htmlText: string;
}): boolean {
  if (opts.hasCustomMime) return true;
  if (opts.hasMediaFiles) return false;
  if (opts.plainText.trim().length > 0) return false;
  if (opts.htmlText.trim().length > 0) return false;
  return true;
}
