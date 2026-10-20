/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZES, READY_MADE_PAPERS, calculateLuminance } from './paperTemplates.ts';

test('SIZES contains standard dimensions with valid aspect ratios', () => {
  assert.equal(SIZES.length, 7);
  for (const s of SIZES) {
    assert.ok(s.width >= 500);
    assert.ok(s.height >= 500);
  }
});

test('READY_MADE_PAPERS includes predefined styles with valid config', () => {
  assert.ok(READY_MADE_PAPERS.length >= 8);
  const blueprint = READY_MADE_PAPERS.find(p => p.name === 'Blueprint');
  assert.ok(blueprint);
  assert.equal(blueprint?.config.k, 'grid');
});

test('calculateLuminance computes light vs dark color thresholds correctly', () => {
  assert.ok(calculateLuminance('#ffffff') > 0.9);
  assert.ok(calculateLuminance('#000000') < 0.1);
  assert.ok(calculateLuminance('#1f2430') < 0.35); // Dark paper threshold
  assert.ok(calculateLuminance('#fff6a8') > 0.8); // Legal pad yellow
});
