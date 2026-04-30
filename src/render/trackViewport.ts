import type { TrackBounds } from "../config/tracks";

export interface TrackViewport {
  readonly centerX: number;
  readonly centerZ: number;
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
}

export interface TrackViewportOptions {
  readonly fovMultiplier?: number;
}

export interface TrackPlanarPoint {
  readonly x: number;
  readonly z: number;
}

export function createTrackViewport(
  bounds: TrackBounds,
  width: number,
  height: number,
  options: TrackViewportOptions = {}
): TrackViewport {
  const trackWidth = bounds.maxX - bounds.minX;
  const trackDepth = bounds.maxZ - bounds.minZ;
  const baseScale = Math.min(
    (width * 0.74) / Math.max(trackWidth, 1),
    (height * 0.68) / Math.max(trackDepth, 1),
    7
  );
  const scale = baseScale / normalizeFovMultiplier(options.fovMultiplier);

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    originX: width / 2,
    originY: height / 2,
    scale
  };
}

function normalizeFovMultiplier(multiplier: number | undefined): number {
  if (multiplier === undefined || !Number.isFinite(multiplier)) {
    return 1;
  }

  return Math.max(multiplier, 0.01);
}

export function projectTrackPoint(
  point: TrackPlanarPoint,
  viewport: TrackViewport
): { readonly x: number; readonly y: number } {
  return {
    x: viewport.originX + (point.x - viewport.centerX) * viewport.scale,
    y: viewport.originY - (point.z - viewport.centerZ) * viewport.scale
  };
}
