/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaperPatternConfig } from '../utils/paperTemplates';

export type ToolType =
  | 'pen'
  | 'hl'
  | 'er'
  | 'pe'
  | 'line'
  | 'rect'
  | 'ell'
  | 'arrow'
  | 'hid'
  | 'ax2'
  | 'ax3'
  | 'text'
  | 'sel'
  | 'bk'
  | 'laser';

export type StylusPressure = '1' | '.6' | '1.7' | 'off';

export interface BaseStroke {
  t: string;
  ts?: number;
  r?: number; // rotation in radians
  er?: Array<{ w: number; p: [number, number][] }>; // erased segments
  fl?: number; // flood fill flag
  nb?: number; // no bake flag
}

export interface PenStroke extends BaseStroke {
  t: 'pen' | 'hl';
  c: string; // color hex
  w: number; // width
  v: string; // pen variant / brush ID
  sd?: number; // random seed for procedural variation
  lt?: number; // last timestamp
  pr?: number; // pressure enabled flag (1 or 0)
  p: Array<[number, number] | [number, number, number]>; // points: [x, y] or [x, y, pressure]
}

export interface EraserStroke extends BaseStroke {
  t: 'ers';
  w: number;
  p: [number, number][];
}

export interface ShapeStroke extends BaseStroke {
  t: 'shape';
  k: 'line' | 'rect' | 'ell' | 'arrow' | 'hid' | 'ax2' | 'ax3';
  c: string;
  w: number;
  ds?: boolean; // dashed outline
  ac?: string[]; // axis colors for ax2/ax3
  a: [number, number];
  b: [number, number];
}

export interface TextStroke extends BaseStroke {
  t: 'text';
  c: string;
  s: number; // font size
  x: number;
  y: number;
  txt: string;
  w?: number; // wrap width
  f: string; // font key
}

export interface ImageStroke extends BaseStroke {
  t: 'img';
  src: string; // data URL or blob URL
  mediaId?: string; // ID in secure media vault
  x: number;
  y: number;
  w: number;
  h: number;
  ras?: number;
}

export interface VideoStroke extends BaseStroke {
  t: 'vid';
  id: string; // video ID
  mediaId?: string;
  src?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FileAttachmentStroke extends BaseStroke {
  t: 'file';
  mediaId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AnyStroke =
  | PenStroke
  | EraserStroke
  | ShapeStroke
  | TextStroke
  | ImageStroke
  | VideoStroke
  | FileAttachmentStroke;

export interface Page {
  pw?: number; // page width (defaults to 800)
  ph?: number; // page height (defaults to 1100)
  tpl: string; // 'lined' | 'blank' | 'grid' | 'dot' | 'cornell'
  col?: string | null; // paper color override
  pp?: PaperPatternConfig;
  strokes: AnyStroke[];
}

export interface FigureItem {
  id: number;
  w: number;
  h: number;
  items: AnyStroke[];
}

export interface Notebook {
  id: number;
  name: string;
  cover: string;
  upd: number;
  fav?: boolean;
  del?: number; // 1 if in trash, 0 or undefined otherwise
  lib?: FigureItem[];
  pages: Page[];
}

export interface BrushDefinition {
  id: string;
  n: string; // name
  t: string | null; // texture hash key in TIPD
  sp: number; // spacing
  sn: number; // scatter noise
  rj: number; // rotation jitter
  rt: number; // rotation range
  f: number; // follow stroke
  oj: number; // opacity jitter
  a0: number; // min scale
  a1: number; // max scale
  o0: number; // min opacity
  o1: number; // max opacity
  q: number; // aspect ratio squish
  g: number; // base rotation angle in degrees
  vt: number; // vertical tangent
  b?: string; // fallback pen variant
  sz?: number; // default stroke size
}

export interface PermissionsState {
  galleryGranted: boolean;
  cameraGranted: boolean;
  soundEnabled: boolean;
  storageGranted: boolean;
}
