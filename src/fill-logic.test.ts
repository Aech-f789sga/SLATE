import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBucketOpacityToSelection,
  applyShapeOpacityToSelection,
  clampFillOpacity,
  DEFAULT_FILL_COLOR,
  formatOpacityPercent,
  hexToRgba,
  hexToRgbTuple,
  isFillableShape,
  isFillStroke,
  normalizeHexColor,
  parseFillState,
  recolorImageDataPreservingAlpha,
  serializeFillState,
} from './fill-logic.ts';

describe('fill-logic color & opacity helpers', () => {
  it('normalizes 6-digit and 3-digit hex strings with fallback', () => {
    assert.equal(normalizeHexColor('#2F6DF6'), '#2f6df6');
    assert.equal(normalizeHexColor('abc'), '#aabbcc');
    assert.equal(normalizeHexColor('  #F0a '), '#ff00aa');
    assert.equal(normalizeHexColor('not-a-color', '#111111'), '#111111');
    assert.equal(normalizeHexColor(null), DEFAULT_FILL_COLOR);
  });

  it('clamps fill opacity to 5%..100% and formats percentage readout', () => {
    assert.equal(clampFillOpacity(0), 0.05);
    assert.equal(clampFillOpacity(-0.4), 0.05);
    assert.equal(clampFillOpacity(0.424), 0.42);
    assert.equal(clampFillOpacity(1.8), 1);
    assert.equal(clampFillOpacity('0.35'), 0.35);
    assert.equal(clampFillOpacity('bad', 0.5), 0.5);
    assert.equal(formatOpacityPercent(0.4), '40%');
    assert.equal(formatOpacityPercent(0.01), '5%');
  });

  it('converts hex colors to RGB tuples and RGBA strings', () => {
    assert.deepEqual(hexToRgbTuple('#2f6df6'), [47, 109, 246]);
    assert.equal(hexToRgba('#e5383b', 0.4), 'rgba(229, 56, 59, 0.4)');
    assert.equal(hexToRgba('#000', 0), 'rgba(0, 0, 0, 0.05)');
  });

  it('parses and serializes persisted fill state safely', () => {
    assert.deepEqual(parseFillState(null, '#e5383b'), { color: '#e5383b', opacity: 1 });
    assert.deepEqual(parseFillState('{invalid', '#111111'), { color: '#111111', opacity: 1 });
    assert.deepEqual(
      parseFillState(serializeFillState({ color: '#5AA9F5', opacity: 0.45 })),
      { color: '#5aa9f5', opacity: 0.45 },
    );
  });
});

describe('fill-logic shape & bitmap helpers', () => {
  it('recognizes all closed fillable shapes including polygons, circles, squares, parallelograms', () => {
    for (const k of ['rect', 'ell', 'tri', 'square', 'circle', 'rhomb', 'para', 'trap', 'poly']) {
      assert.equal(isFillableShape({ t: 'shape', k }), true, `expected ${k} to be fillable`);
    }
    assert.equal(isFillableShape({ t: 'shape', k: 'line' }), false);
    assert.equal(isFillableShape({ t: 'shape', k: 'arrow' }), false);
    assert.equal(isFillableShape({ t: 'shape', k: 'ax2' }), false);
    assert.equal(isFillableShape({ t: 'pen', k: 'rect' }), false);
    assert.equal(isFillableShape({ t: 'shape', k: 'custom', poly: [[0, 0], [10, 0], [10, 10]] }), true);
  });

  it('identifies flood-fill image strokes', () => {
    assert.equal(isFillStroke({ t: 'img', fl: 1 }), true);
    assert.equal(isFillStroke({ t: 'img' }), false);
    assert.equal(isFillStroke({ t: 'pen', fl: 1 }), false);
  });

  it('recolors visible pixels while keeping transparent and anti-aliased alpha intact', () => {
    const buf = new Uint8ClampedArray([
      0, 0, 0, 0, // transparent pixel — untouched
      10, 20, 30, 128, // semi-transparent edge — RGB changes, alpha 128 stays
      10, 20, 30, 255, // opaque fill — RGB changes, alpha 255 stays
    ]);
    const changed = recolorImageDataPreservingAlpha(buf, '#e5383b');
    assert.equal(changed, true);
    assert.deepEqual(Array.from(buf), [
      0, 0, 0, 0,
      229, 56, 59, 128,
      229, 56, 59, 255,
    ]);
    assert.equal(recolorImageDataPreservingAlpha(buf, '#e5383b'), false);
  });

  it('updates opacity on selected flood fills and filled shapes cleanly', () => {
    const fill = { t: 'img', fl: 1, fc: '#2f6df6' };
    const photo = { t: 'img', src: 'photo' };
    const circle = { t: 'shape', k: 'circle', fc: '#f5c542', fop: 0.35 };
    const emptyRect = { t: 'shape', k: 'rect' };

    assert.equal(applyBucketOpacityToSelection([fill, photo, circle, emptyRect], 0.4), true);
    assert.equal((fill as any).op, 0.4);
    assert.equal((photo as any).op, undefined);
    assert.equal(circle.fop, 0.4);
    assert.equal((emptyRect as any).fop, undefined);

    assert.equal(applyBucketOpacityToSelection([fill], 1), true);
    assert.equal('op' in fill, false);

    assert.equal(applyShapeOpacityToSelection([circle, emptyRect, fill], 0.75), true);
    assert.equal(circle.fop, 0.75);
    assert.equal('op' in fill, false);
  });
});
