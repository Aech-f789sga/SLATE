import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseInternalFigFallback,
  computeAutoScrollStep,
  mapCrossPageTransform,
  resolveDropTarget,
  selectionScreenBox,
  shouldReleaseScrollPin,
  type SheetRect,
} from './strip-logic';

function makeSheets(count: number, opts?: { pw?: number; ph?: number; width?: number; height?: number; gap?: number; top0?: number }): SheetRect[] {
  const pw = opts?.pw ?? 800;
  const ph = opts?.ph ?? 1100;
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 1100;
  const gap = opts?.gap ?? 12;
  const top0 = opts?.top0 ?? 20;
  const out: SheetRect[] = [];
  for (let i = 0; i < count; i++) {
    const top = top0 + i * (height + gap);
    out.push({
      index: i,
      left: 100,
      top,
      right: 100 + width,
      bottom: top + height,
      width,
      height,
      pw,
      ph,
    });
  }
  return out;
}

test('resolveDropTarget keeps object on page 0 when dragged inside page 0', () => {
  const sheets = makeSheets(3);
  assert.equal(resolveDropTarget(sheets, 0, [100, 200, 300, 400], 320), 0);
});

test('resolveDropTarget transfers figure dragged down onto page 2', () => {
  const sheets = makeSheets(3);
  // Page 0 ends at ph=1100 (+12px gap => Page 1 starts at y_on_p0 = 1112).
  // Dragging figure from y=200..300 down by 1150 -> y=1350..1450 (clearly inside Page 1).
  assert.equal(resolveDropTarget(sheets, 0, [100, 1350, 300, 1450], 1420), 1);
});

test('resolveDropTarget handles boundary split according to majority overlap & center', () => {
  const sheets = makeSheets(3);
  // 200px tall figure centered across Page 0 / Page 1 break (top at 1050, bottom at 1250).
  // Page 0 has 1050..1100 (50px), Page 1 starts at 1112 -> 1112..1250 (138px). Majority is Page 1.
  assert.equal(resolveDropTarget(sheets, 0, [100, 1050, 300, 1250], 1220), 1);
  // Barely peeking 20px into Page 1 (top at 940, bottom at 1140) -> majority still Page 0.
  assert.equal(resolveDropTarget(sheets, 0, [100, 940, 300, 1140], 1040), 0);
});

test('resolveDropTarget transfers figure dragged upward from page 2 to page 1', () => {
  const sheets = makeSheets(3);
  // Relative to Page 1 (index 1), y = -400..-300 sits cleanly inside Page 0!
  assert.equal(resolveDropTarget(sheets, 1, [120, -400, 260, -300], 770), 0);
});

test('resolveDropTarget handles drop inside the 12px page gap by nearest center / pointer', () => {
  const sheets = makeSheets(2);
  // Very thin line dropped squarely inside the 12px gap (1103..1109 on screen offset)
  const target = resolveDropTarget(sheets, 0, [100, 1104, 300, 1108], 1126 + 20);
  assert.equal(target, 1);
});

test('mapCrossPageTransform preserves exact screen coordinates across equal-sized scaled sheets', () => {
  // Zoomed / scaled sheets: CSS size 400x550 for 800x1100 logical page, GAP=12
  const sheets = makeSheets(2, { width: 400, height: 550, gap: 12, top0: 20 });
  const srcBox: [number, number, number, number] = [100, 1324, 300, 1524];
  const sbBefore = selectionScreenBox(sheets[0], srcBox);

  const tf = mapCrossPageTransform(sheets[0], sheets[1], srcBox);
  assert.equal(tf.scaleX, 1);
  assert.equal(tf.scaleY, 1);
  assert.equal(tf.clampDx, 0);
  assert.equal(tf.clampDy, 0);

  const sbAfter = selectionScreenBox(sheets[1], tf.dstBox);
  assert.ok(Math.abs(sbAfter.left - sbBefore.left) < 1e-6);
  assert.ok(Math.abs(sbAfter.top - sbBefore.top) < 1e-6);
  assert.ok(Math.abs(sbAfter.right - sbBefore.right) < 1e-6);
  assert.ok(Math.abs(sbAfter.bottom - sbBefore.bottom) < 1e-6);
  // 1324 in page units: page 1 starts at 1100 + 12*(1100/550) = 1124 -> dst top = 200!
  assert.equal(Math.round(tf.dstBox[1]), 200);
});

test('mapCrossPageTransform nudges minimally only when dropped wholly outside target bounds', () => {
  const sheets = makeSheets(2, { width: 800, height: 1100, gap: 12, top0: 20 });
  // Dragged completely past the bottom of page 1 (src y = 2400..2500 -> dst y = 1288..1388)
  const tf = mapCrossPageTransform(sheets[0], sheets[1], [100, 2400, 200, 2500]);
  assert.ok(tf.clampDy < 0);
  assert.ok(tf.dstBox[1] < 1100);
});

test('shouldReleaseScrollPin holds pinned page during small layout/clamp scroll deltas', () => {
  assert.equal(shouldReleaseScrollPin(1, 10, 0), false);
  assert.equal(shouldReleaseScrollPin(1, 35, 0), false);
  assert.equal(shouldReleaseScrollPin(1, 60, 0), true);
  assert.equal(shouldReleaseScrollPin(null, 0, 0), true);
});

test('computeAutoScrollStep triggers only inside stage edge margins', () => {
  assert.equal(computeAutoScrollStep(400, 100, 800), 0);
  assert.ok(computeAutoScrollStep(110, 100, 800) < 0);
  assert.ok(computeAutoScrollStep(790, 100, 800) > 0);
  assert.equal(computeAutoScrollStep(null, 100, 800), 0);
});

test('canUseInternalFigFallback yields to external images, plain text, or HTML', () => {
  assert.equal(
    canUseInternalFigFallback({ hasCustomMime: true, hasMediaFiles: true, plainText: 'hi', htmlText: '' }),
    true
  );
  assert.equal(
    canUseInternalFigFallback({ hasCustomMime: false, hasMediaFiles: false, plainText: '', htmlText: '' }),
    true
  );
  assert.equal(
    canUseInternalFigFallback({ hasCustomMime: false, hasMediaFiles: true, plainText: '', htmlText: '' }),
    false
  );
  assert.equal(
    canUseInternalFigFallback({ hasCustomMime: false, hasMediaFiles: false, plainText: 'copied note', htmlText: '' }),
    false
  );
  assert.equal(
    canUseInternalFigFallback({ hasCustomMime: false, hasMediaFiles: false, plainText: '', htmlText: '<b>x</b>' }),
    false
  );
});
