/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PageSizePreset {
  name: string;
  width: number;
  height: number;
}

export interface PaperPatternConfig {
  bg?: string;
  k: 'blank' | 'lined' | 'grid' | 'graph' | 'dot' | 'iso' | 'music' | 'cornell';
  ln?: string;
  mg?: string;
  mx?: number;
  gap?: number;
  lw?: number;
}

export const SIZES: PageSizePreset[] = [
  { name: 'Letter', width: 800, height: 1035 },
  { name: 'A4', width: 800, height: 1131 },
  { name: 'A5', width: 566, height: 800 },
  { name: 'A3', width: 1131, height: 1600 },
  { name: 'Square', width: 900, height: 900 },
  { name: 'Landscape A4', width: 1131, height: 800 },
  { name: 'Wide 16:9', width: 1280, height: 720 },
];

export const READY_MADE_PAPERS: Array<{ name: string; config: PaperPatternConfig }> = [
  {
    name: 'Legal pad',
    config: {
      bg: '#fff6a8',
      k: 'lined',
      ln: 'rgba(60,110,200,.45)',
      mg: 'rgba(220,60,60,.6)',
      mx: 100,
      gap: 32,
    },
  },
  {
    name: 'Engineering graph',
    config: { bg: '#f2faf1', k: 'graph', ln: 'rgba(60,150,90,.35)', gap: 16 },
  },
  {
    name: 'Blueprint',
    config: { bg: '#143d7a', k: 'grid', ln: 'rgba(255,255,255,.3)', gap: 32 },
  },
  {
    name: 'Blackboard',
    config: { bg: '#22372c', k: 'grid', ln: 'rgba(255,255,255,.12)', gap: 40 },
  },
  {
    name: 'Kraft',
    config: { bg: '#d9bd8f', k: 'dot', ln: 'rgba(90,60,20,.5)', gap: 32 },
  },
  {
    name: 'Parchment',
    config: { bg: '#f3e6c6', k: 'lined', ln: 'rgba(120,80,30,.3)', gap: 34 },
  },
  {
    name: 'Isometric dots',
    config: { bg: '#ffffff', k: 'iso', ln: 'rgba(120,140,170,.6)', gap: 28 },
  },
  {
    name: 'Music staff',
    config: { bg: '#ffffff', k: 'music', ln: 'rgba(40,40,40,.6)', gap: 10 },
  },
  {
    name: 'Mint dots',
    config: { bg: '#e9f8f0', k: 'dot', ln: 'rgba(40,140,110,.5)', gap: 28 },
  },
];

export function calculateLuminance(hexColor: string): number {
  if (!hexColor || !hexColor.startsWith('#') || hexColor.length < 7) return 1.0;
  const n = parseInt(hexColor.slice(1, 7), 16);
  if (isNaN(n)) return 1.0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
