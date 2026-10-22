/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DeviceType = 'phone' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';
export type AutoFitMode = 'auto' | 'fit-width' | 'fit-height' | 'actual';

export interface ViewportState {
  width: number;
  height: number;
  deviceType: DeviceType;
  orientation: Orientation;
  isTouch: boolean;
}

export function detectDevice(width: number, height: number, isTouchDevice: boolean = false): ViewportState {
  const orientation: Orientation = width >= height ? 'landscape' : 'portrait';

  let deviceType: DeviceType = 'desktop';

  // Small screen widths or landscape phone (low height)
  if (width < 640 || (orientation === 'landscape' && height < 520 && width < 960)) {
    deviceType = 'phone';
  } else if (width < 1024 || (isTouchDevice && width < 1366)) {
    deviceType = 'tablet';
  } else {
    deviceType = 'desktop';
  }

  return {
    width,
    height,
    deviceType,
    orientation,
    isTouch: isTouchDevice,
  };
}

export function computeAutoZoom(
  pageWidth: number,
  pageHeight: number,
  stageWidth: number,
  stageHeight: number,
  mode: AutoFitMode,
  orientation: Orientation,
  deviceType: DeviceType
): number {
  if (mode === 'actual') return 1.0;

  const padX = deviceType === 'phone' ? 16 : 40;
  const padY = deviceType === 'phone' ? 16 : 40;
  const availW = Math.max(100, stageWidth - padX);
  const availH = Math.max(100, stageHeight - padY);

  const scaleW = availW / pageWidth;
  const scaleH = availH / pageHeight;

  if (mode === 'fit-width') {
    return Math.min(3.0, Math.max(0.3, scaleW));
  }
  if (mode === 'fit-height') {
    return Math.min(3.0, Math.max(0.3, scaleH));
  }

  // 'auto' mode:
  // On phones in portrait: fit width for comfortable reading & writing
  // On phones in landscape: fit height so full vertical canvas fits without scroll
  // On tablets & desktops: fit the best dimension that keeps it contained nicely
  if (deviceType === 'phone') {
    if (orientation === 'portrait') {
      return Math.min(2.0, Math.max(0.35, scaleW));
    } else {
      return Math.min(2.0, Math.max(0.35, scaleH));
    }
  }

  // Tablet / Desktop
  if (orientation === 'landscape') {
    // If landscape, fit height or fit min(scaleW, scaleH)
    return Math.min(2.5, Math.max(0.4, Math.min(scaleW, scaleH)));
  } else {
    // Portrait tablet / desktop: fit width
    return Math.min(2.5, Math.max(0.4, Math.min(scaleW, 1.1)));
  }
}
