/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dens, inPoly, shapePts, rotateBox, zEnd } from './geometry.ts';

test('dens interpolates points along a line segment', () => {
  const pts: [number, number][] = [[0, 0], [10, 0]];
  const dense = dens(pts, 2);
  assert.ok(dense.length > pts.length);
  assert.equal(dense[0][0], 0);
  assert.equal(dense[dense.length - 1][0], 10);
});

test('inPoly detects points inside and outside a polygon', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(inPoly([5, 5], square), true);
  assert.equal(inPoly([15, 5], square), false);
  assert.equal(inPoly([-1, 5], square), false);
});

test('zEnd calculates 3D projection endpoint', () => {
  const a: [number, number] = [100, 100];
  const b: [number, number] = [200, 200];
  const z = zEnd(a, b);
  assert.ok(z[0] < a[0]);
  assert.ok(z[1] > a[1]);
});

test('shapePts generates expected shape vertices', () => {
  const line = shapePts('line', [0, 0], [60, 0]);
  assert.ok(line.length >= 10);

  const rect = shapePts('rect', [0, 0], [100, 100]);
  assert.ok(rect.length > 20);

  const ell = shapePts('ell', [0, 0], [100, 100]);
  assert.equal(ell.length, 73);
});

test('rotateBox preserves centered bounds under 90 degree rotation of a square', () => {
  const box: [number, number, number, number] = [-10, -10, 10, 10];
  const rotated = rotateBox(box, Math.PI / 2);
  assert.ok(Math.abs(rotated[0] - -10) < 0.001);
  assert.ok(Math.abs(rotated[1] - -10) < 0.001);
  assert.ok(Math.abs(rotated[2] - 10) < 0.001);
  assert.ok(Math.abs(rotated[3] - 10) < 0.001);
});
