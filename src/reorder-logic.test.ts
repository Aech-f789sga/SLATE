import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGridDropIndex,
  computeVerticalDropIndex,
  moveNotebookInOrder,
  parseNotebookOrder,
  reorderPagesState,
  serializeNotebookOrder,
  sortNotebooksWithOrder,
  type ItemRect,
} from './reorder-logic.ts';

describe('reorder-logic notebook ordering', () => {
  it('parses and serializes persisted notebook ID order safely', () => {
    assert.deepEqual(parseNotebookOrder(null), []);
    assert.deepEqual(parseNotebookOrder('not-json'), []);
    assert.deepEqual(parseNotebookOrder('[101, "101", "nb-2", null, 303]'), ['101', 'nb-2', '303']);
    assert.equal(serializeNotebookOrder(['a', 'a', 'b']), '["a","b"]');
  });

  it('falls back to upd descending when no custom order exists', () => {
    const nbs = [
      { id: 1, upd: 100 },
      { id: 2, upd: 300 },
      { id: 3, upd: 200 },
    ];
    assert.deepEqual(
      sortNotebooksWithOrder(nbs, []).map((n) => n.id),
      [2, 3, 1],
    );
  });

  it('preserves custom order across upd timestamp changes and puts new notebooks first', () => {
    const nbs = [
      { id: 1, upd: 9999 }, // edited most recently, should still stay in custom slot
      { id: 2, upd: 100 },
      { id: 3, upd: 200 },
      { id: 4, upd: 5000 }, // newly created notebook not yet in order
    ];
    const sorted = sortNotebooksWithOrder(nbs, ['3', '1', '2']);
    assert.deepEqual(
      sorted.map((n) => n.id),
      [4, 3, 1, 2],
    );
  });

  it('moves visible notebooks in full order without disturbing hidden notebooks', () => {
    // Full shelf order: [a, hidden1, b, hidden2, c]
    // Active folder shows: [a, b, c]
    const all = ['a', 'hidden1', 'b', 'hidden2', 'c'];
    const visible = ['a', 'b', 'c'];

    // Move 'c' (visible 2) before 'a' (visible 0)
    assert.deepEqual(moveNotebookInOrder(visible, all, all, 2, 0), ['c', 'a', 'hidden1', 'b', 'hidden2']);

    // Move 'a' (visible 0) after 'c' (visible 2)
    assert.deepEqual(moveNotebookInOrder(visible, all, all, 0, 2), ['hidden1', 'b', 'hidden2', 'c', 'a']);

    // No-op when from === to
    assert.deepEqual(moveNotebookInOrder(visible, all, all, 1, 1), all);
  });
});

describe('reorder-logic page reordering', () => {
  it('moves pages forward and backward while keeping activePi attached to the same page', () => {
    const pages = ['p1', 'p2', 'p3', 'p4'];

    // Active page is moved from 0 to 2
    const r1 = reorderPagesState(pages, 0, 0, 2);
    assert.equal(r1.moved, true);
    assert.deepEqual(r1.pages, ['p2', 'p3', 'p1', 'p4']);
    assert.equal(r1.pi, 2);
    assert.equal(r1.pages[r1.pi], 'p1');

    // Viewing p2 (idx 1) while p1 (idx 0) moves to idx 2 -> p2 shifts to idx 0
    const r2 = reorderPagesState(pages, 1, 0, 2);
    assert.equal(r2.pi, 0);
    assert.equal(r2.pages[r2.pi], 'p2');

    // Viewing p2 (idx 1) while p4 (idx 3) moves to idx 0 -> p2 shifts to idx 2
    const r3 = reorderPagesState(pages, 1, 3, 0);
    assert.deepEqual(r3.pages, ['p4', 'p1', 'p2', 'p3']);
    assert.equal(r3.pi, 2);
    assert.equal(r3.pages[r3.pi], 'p2');

    // Viewing p4 (idx 3) while p1 (idx 0) moves to idx 1 -> p4 stays idx 3
    const r4 = reorderPagesState(pages, 3, 0, 1);
    assert.equal(r4.pi, 3);
    assert.equal(r4.pages[r4.pi], 'p4');

    // Out of bounds / same index returns moved: false
    const noop = reorderPagesState(pages, 1, 1, 1);
    assert.equal(noop.moved, false);
    assert.equal(noop.pi, 1);
  });
});

describe('reorder-logic drop hit testing', () => {
  it('computes vertical drop index cleanly against initial home rects', () => {
    const homes: ItemRect[] = [
      { left: 10, top: 10, width: 100, height: 100 }, // mid 60
      { left: 10, top: 120, width: 100, height: 100 }, // mid 170
      { left: 10, top: 230, width: 100, height: 100 }, // mid 280
    ];

    assert.equal(computeVerticalDropIndex(homes, 2, 20), 0);
    assert.equal(computeVerticalDropIndex(homes, 2, 100), 1);
    assert.equal(computeVerticalDropIndex(homes, 2, 200), 2);
    assert.equal(computeVerticalDropIndex(homes, 0, 50), 0);
    assert.equal(computeVerticalDropIndex(homes, 0, 180), 1);
    assert.equal(computeVerticalDropIndex(homes, 0, 290), 2);
  });

  it('computes 2D grid drop index across rows and columns', () => {
    const homes: ItemRect[] = [
      // Row 0
      { left: 0, top: 0, width: 150, height: 200 }, // 0: cx 75
      { left: 170, top: 0, width: 150, height: 200 }, // 1: cx 245
      { left: 340, top: 0, width: 150, height: 200 }, // 2: cx 415
      // Row 1
      { left: 0, top: 220, width: 150, height: 200 }, // 3: cx 75
      { left: 170, top: 220, width: 150, height: 200 }, // 4: cx 245
    ];

    // Dragging item 4 before item 0
    assert.equal(computeGridDropIndex(homes, 4, 40, 80, false), 0);
    // Dragging item 4 between item 0 and 1
    assert.equal(computeGridDropIndex(homes, 4, 180, 80, false), 1);
    // Dragging item 0 onto row 1 after item 4
    assert.equal(computeGridDropIndex(homes, 0, 300, 310, false), 4);
    // Above top snaps to 0, below bottom snaps to last
    assert.equal(computeGridDropIndex(homes, 3, 250, -20, false), 0);
    assert.equal(computeGridDropIndex(homes, 0, 20, 500, false), 4);
  });
});
