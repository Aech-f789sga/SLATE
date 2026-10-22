/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDevice, computeAutoZoom } from './layout.ts';

test('detectDevice classifies phone portrait and landscape correctly', () => {
  // iPhone portrait (390 x 844)
  const phonePortrait = detectDevice(390, 844, true);
  assert.equal(phonePortrait.deviceType, 'phone');
  assert.equal(phonePortrait.orientation, 'portrait');

  // iPhone landscape (844 x 390)
  const phoneLandscape = detectDevice(844, 390, true);
  assert.equal(phoneLandscape.deviceType, 'phone');
  assert.equal(phoneLandscape.orientation, 'landscape');
});

test('detectDevice classifies tablet portrait and landscape correctly', () => {
  // iPad portrait (810 x 1080)
  const tabletPortrait = detectDevice(810, 1080, true);
  assert.equal(tabletPortrait.deviceType, 'tablet');
  assert.equal(tabletPortrait.orientation, 'portrait');

  // iPad landscape (1080 x 810)
  const tabletLandscape = detectDevice(1080, 810, true);
  assert.equal(tabletLandscape.deviceType, 'tablet');
  assert.equal(tabletLandscape.orientation, 'landscape');
});

test('detectDevice classifies desktop monitors correctly', () => {
  const desktop = detectDevice(1920, 1080, false);
  assert.equal(desktop.deviceType, 'desktop');
  assert.equal(desktop.orientation, 'landscape');
});

test('computeAutoZoom adapts automatically based on orientation and device', () => {
  const pw = 800;
  const ph = 1100;

  // Phone portrait: fits width
  const phoneZoom = computeAutoZoom(pw, ph, 400, 800, 'auto', 'portrait', 'phone');
  // (400 - 16) / 800 = 0.48
  assert.ok(phoneZoom > 0.45 && phoneZoom < 0.55);

  // Phone landscape: fits height so entire page fits vertically
  const phoneLandZoom = computeAutoZoom(pw, ph, 800, 380, 'auto', 'landscape', 'phone');
  // (380 - 16) / 1100 = 0.33 -> min is 0.35
  assert.ok(phoneLandZoom >= 0.35);

  // Desktop landscape
  const deskZoom = computeAutoZoom(pw, ph, 1400, 900, 'auto', 'landscape', 'desktop');
  assert.ok(deskZoom > 0.7 && deskZoom < 1.0);
});
