import { buildProfileContour } from "./geometry";
import type { VaseParameters } from "./types";
import { ValidationError } from "./validation";

export interface BuildVolume {
  width: number;
  depth: number;
  height: number;
}

export interface VaseEnvelope {
  width: number;
  depth: number;
  height: number;
}

const BUILD_VOLUME_TOLERANCE_MM = 1e-6;

export function maxPrintableDiameterMm(volume: BuildVolume): number {
  return Math.max(0, Math.min(volume.width, volume.depth));
}

export function computeVaseEnvelopeMm(params: VaseParameters): VaseEnvelope {
  const contourSamples = Math.min(Math.max(params.radialSamples, 16), 128);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const profile of params.profiles) {
    const contour = buildProfileContour(profile, contourSamples);
    for (let i = 0; i < contour.length / 2; i++) {
      const x = contour[i * 2];
      const y = contour[i * 2 + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { width: 0, depth: 0, height: Math.max(0, params.heightMm) };
  }

  return {
    width: maxX - minX,
    depth: maxY - minY,
    height: Math.max(0, params.heightMm),
  };
}

export function clampParamsToBuildVolume(params: VaseParameters, volume: BuildVolume): VaseParameters {
  const maxHeight = Math.max(1, volume.height);
  const maxDiameter = Math.max(1, maxPrintableDiameterMm(volume));
  const minAllowedDiameter = Math.max(params.wallThicknessMm * 2 + 2, 1);
  const clampedDiameterLimit = Math.max(minAllowedDiameter, maxDiameter);

  return {
    ...params,
    heightMm: Math.min(params.heightMm, maxHeight),
    profiles: params.profiles.map((profile) => ({
      ...profile,
      diameter: Math.min(profile.diameter, clampedDiameterLimit),
    })),
  };
}

export function validateParamsAgainstBuildVolume(params: VaseParameters, volume: BuildVolume): void {
  const envelope = computeVaseEnvelopeMm(params);
  if (envelope.height > volume.height + BUILD_VOLUME_TOLERANCE_MM) {
    throw new ValidationError(
      `La hauteur du vase (${envelope.height.toFixed(1)} mm) dépasse la hauteur imprimable (${volume.height.toFixed(1)} mm).`,
    );
  }
  if (envelope.width > volume.width + BUILD_VOLUME_TOLERANCE_MM) {
    throw new ValidationError(
      `La largeur du vase (${envelope.width.toFixed(1)} mm) dépasse la largeur imprimable (${volume.width.toFixed(1)} mm).`,
    );
  }
  if (envelope.depth > volume.depth + BUILD_VOLUME_TOLERANCE_MM) {
    throw new ValidationError(
      `La profondeur du vase (${envelope.depth.toFixed(1)} mm) dépasse la profondeur imprimable (${volume.depth.toFixed(1)} mm).`,
    );
  }
}
