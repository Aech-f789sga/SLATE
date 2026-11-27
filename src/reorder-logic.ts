export const LIB_ORDER_STORAGE_KEY = 'inkpad-lib-order';

export interface OrderableNotebook {
  id: string | number;
  upd?: number;
}

export interface ItemRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Parses persisted custom notebook order JSON into deduplicated string IDs.
 */
export function parseNotebookOrder(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string' && typeof entry !== 'number') continue;
      const id = String(entry);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeNotebookOrder(orderIds: readonly string[]): string {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const id of orderIds) {
    const s = String(id);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    clean.push(s);
  }
  return JSON.stringify(clean);
}

/**
 * Sorts notebooks honoring saved custom order IDs.
 * Unordered/newly-created notebooks appear first (newest upd first), followed
 * by notebooks in their exact saved custom order. If no custom order exists,
 * falls back cleanly to `(b.upd || 0) - (a.upd || 0)`.
 */
export function sortNotebooksWithOrder<T extends OrderableNotebook>(
  notebooks: readonly T[],
  orderIds: readonly string[],
): T[] {
  if (!orderIds.length) {
    return [...notebooks].sort((a, b) => (b.upd || 0) - (a.upd || 0));
  }
  const rank = new Map<string, number>();
  orderIds.forEach((id, idx) => {
    const key = String(id);
    if (!rank.has(key)) rank.set(key, idx);
  });
  return [...notebooks].sort((a, b) => {
    const ra = rank.get(String(a.id));
    const rb = rank.get(String(b.id));
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra === undefined && rb !== undefined) return -1;
    if (ra !== undefined && rb === undefined) return 1;
    return (b.upd || 0) - (a.upd || 0);
  });
}

/**
 * Moves a notebook inside the full saved library order based on a drag-reorder
 * within a possibly-filtered visible subset (e.g., folder chip or favorites).
 * Hidden notebooks keep their relative positions intact.
 */
export function moveNotebookInOrder(
  visibleIds: readonly string[],
  currentOrderIds: readonly string[],
  allOrderedIds: readonly string[],
  fromVisibleIdx: number,
  toVisibleIdx: number,
): string[] {
  const vis = visibleIds.map((id) => String(id));
  if (
    fromVisibleIdx < 0 ||
    fromVisibleIdx >= vis.length ||
    toVisibleIdx < 0 ||
    toVisibleIdx >= vis.length ||
    fromVisibleIdx === toVisibleIdx
  ) {
    return buildNormalizedOrder(currentOrderIds, allOrderedIds);
  }

  const movingId = vis[fromVisibleIdx];
  const base = buildNormalizedOrder(currentOrderIds, allOrderedIds);
  const withoutMoving = base.filter((id) => id !== movingId);
  const visibleWithoutMoving = vis.filter((id) => id !== movingId);

  let insertIdx: number;
  if (toVisibleIdx < visibleWithoutMoving.length) {
    const targetBeforeId = visibleWithoutMoving[toVisibleIdx];
    const found = withoutMoving.indexOf(targetBeforeId);
    insertIdx = found >= 0 ? found : withoutMoving.length;
  } else if (visibleWithoutMoving.length > 0) {
    const lastVisibleId = visibleWithoutMoving[visibleWithoutMoving.length - 1];
    const found = withoutMoving.indexOf(lastVisibleId);
    insertIdx = found >= 0 ? found + 1 : withoutMoving.length;
  } else {
    insertIdx = withoutMoving.length;
  }

  const next = [...withoutMoving];
  next.splice(Math.max(0, Math.min(next.length, insertIdx)), 0, movingId);
  return next;
}

function buildNormalizedOrder(
  currentOrderIds: readonly string[],
  allOrderedIds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of allOrderedIds) {
    const s = String(id);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  for (const id of currentOrderIds) {
    const s = String(id);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Reorders `pages` from `fromIdx` to `toIdx` and remaps `activePi` so the
 * currently open page follows itself across the move.
 */
export function reorderPagesState<T>(
  pages: readonly T[],
  activePi: number,
  fromIdx: number,
  toIdx: number,
): { pages: T[]; pi: number; moved: boolean } {
  const len = pages.length;
  const safePi = Math.max(0, Math.min(len - 1, activePi));
  if (
    len < 2 ||
    fromIdx < 0 ||
    fromIdx >= len ||
    toIdx < 0 ||
    toIdx >= len ||
    fromIdx === toIdx
  ) {
    return { pages: [...pages], pi: safePi, moved: false };
  }

  const nextPages = [...pages];
  const [movedPage] = nextPages.splice(fromIdx, 1);
  nextPages.splice(toIdx, 0, movedPage);

  let nextPi = safePi;
  if (safePi === fromIdx) {
    nextPi = toIdx;
  } else if (fromIdx < safePi && safePi <= toIdx) {
    nextPi = safePi - 1;
  } else if (toIdx <= safePi && safePi < fromIdx) {
    nextPi = safePi + 1;
  }

  return { pages: nextPages, pi: nextPi, moved: true };
}

/**
 * Computes target index (0 .. homes.length - 1) for a vertical stack of items
 * such as the page thumbnails sidebar or list-mode notebook shelf.
 */
export function computeVerticalDropIndex(
  homes: readonly ItemRect[],
  fromIdx: number,
  clientY: number,
): number {
  const n = homes.length;
  if (n <= 1) return 0;
  let passed = 0;
  for (let i = 0; i < n; i++) {
    if (i === fromIdx) continue;
    const r = homes[i];
    const midY = r.top + r.height / 2;
    if (clientY > midY) passed++;
  }
  return Math.max(0, Math.min(n - 1, passed));
}

/**
 * Computes target index (0 .. homes.length - 1) for a 2D CSS grid (or vertical list).
 * Expects `homes` captured once at lift in DOM order, avoiding layout feedback jitter.
 */
export function computeGridDropIndex(
  homes: readonly ItemRect[],
  fromIdx: number,
  clientX: number,
  clientY: number,
  isList: boolean,
): number {
  const n = homes.length;
  if (n <= 1) return 0;
  if (isList) return computeVerticalDropIndex(homes, fromIdx, clientY);

  // Group initial home rects into visual rows based on vertical overlap / center distance.
  const rows: { indices: number[]; top: number; bottom: number; midY: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = homes[i];
    const cy = r.top + r.height / 2;
    const last = rows[rows.length - 1];
    if (last && Math.abs(cy - last.midY) <= Math.max(24, r.height * 0.55)) {
      last.indices.push(i);
      last.top = Math.min(last.top, r.top);
      last.bottom = Math.max(last.bottom, r.top + r.height);
      last.midY = (last.top + last.bottom) / 2;
    } else {
      rows.push({ indices: [i], top: r.top, bottom: r.top + r.height, midY: cy });
    }
  }

  if (clientY < rows[0].top) return 0;
  const lastRow = rows[rows.length - 1];
  if (clientY > lastRow.bottom) return n - 1;

  // Pick row with minimum vertical distance to [top, bottom] (breaking ties by midY).
  let targetRow = rows[0];
  let bestRowDist = Infinity;
  for (const row of rows) {
    const dist =
      clientY < row.top ? row.top - clientY : clientY > row.bottom ? clientY - row.bottom : Math.abs(clientY - row.midY) * 0.01;
    if (dist < bestRowDist) {
      bestRowDist = dist;
      targetRow = row;
    }
  }

  // Determine insertion position (0..n) in reading order inside the target row.
  const firstInRow = targetRow.indices[0];
  let rawPos = firstInRow;
  for (const idx of targetRow.indices) {
    const r = homes[idx];
    const midX = r.left + r.width / 2;
    if (clientX > midX) rawPos = idx + 1;
    else break;
  }

  if (rawPos > fromIdx) {
    return Math.max(0, Math.min(n - 1, rawPos - 1));
  }
  return Math.max(0, Math.min(n - 1, rawPos));
}
