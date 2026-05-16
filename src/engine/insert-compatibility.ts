import { computeInnerContour } from "./constraints";
import {
  buildProfileContour,
  buildProfileContourFromVertex,
  interpolateContours,
  regularPolygonVertices,
} from "./geometry";
import type { VaseParameters } from "./types";

const FACETED_SEAM_MAX_PROFILE_SIDES = 12;
const INSERT_SECTION_SAMPLES = 96;
const INSERT_FIT_SAMPLES = 72;
const INSERT_DIAMETER_TOLERANCE_MM = 0.35;

export type InsertPreset = {
  id: string;
  label: string;
  type: "eco_cup" | "test_tube";
  heightMm: number;
  topDiameterMm: number;
  bottomDiameterMm?: number;
  clearanceMm: number;
};

export type WaterproofInsertCompatibility = {
  presetId: string;
  label: string;
  type: "eco_cup" | "test_tube";
};

export const INSERT_PRESETS: readonly InsertPreset[] = [
  {
    id: "eco-cup-50cl",
    label: "Eco-Cup 50 cl",
    type: "eco_cup",
    heightMm: 166,
    topDiameterMm: 88,
    bottomDiameterMm: 67,
    clearanceMm: 3,
  },
  {
    id: "eco-cup-25cl",
    label: "Eco-Cup 25 cl",
    type: "eco_cup",
    heightMm: 118,
    topDiameterMm: 76,
    bottomDiameterMm: 58,
    clearanceMm: 3,
  },
  {
    id: "eco-cup-12-5cl",
    label: "Eco-Cup 12,5 cl",
    type: "eco_cup",
    heightMm: 98,
    topDiameterMm: 67,
    bottomDiameterMm: 53,
    clearanceMm: 3,
  },
  {
    id: "test-tube-75x20",
    label: "Tube à essai 75 × 20 mm",
    type: "test_tube",
    heightMm: 75,
    topDiameterMm: 21.5,
    bottomDiameterMm: 21.5,
    clearanceMm: 1.5,
  },
] as const;

export function getInsertPresetById(presetId: string): InsertPreset | null {
  return INSERT_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

function shouldKeepFacetEdgeSeamIdentity(profiles: VaseParameters["profiles"]): boolean {
  const sideCount = profiles[0]?.sides ?? 0;
  return (
    sideCount >= 3 &&
    sideCount <= FACETED_SEAM_MAX_PROFILE_SIDES &&
    profiles.every((profile) => profile.sides === sideCount)
  );
}

function normalizedAngularDistance(a: number, b: number): number {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(diff);
}

function computeSharedFacetSeamVertexIndex(profiles: VaseParameters["profiles"]): number {
  const sideCount = profiles[0]?.sides ?? 0;
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let vertexIndex = 0; vertexIndex < sideCount; vertexIndex++) {
    let score = 0;

    for (const profile of profiles) {
      const vertices = regularPolygonVertices(profile);
      const x = vertices[vertexIndex * 2];
      const y = vertices[vertexIndex * 2 + 1];
      const angle = Math.atan2(y - profile.offsetY, x - profile.offsetX);
      score += normalizedAngularDistance(angle, -Math.PI / 2);
    }

    if (score < bestScore) {
      bestScore = score;
      bestIndex = vertexIndex;
    }
  }

  return bestIndex;
}

function buildOrderedContours(params: VaseParameters): { zPositions: number[]; contours: Float64Array[] } {
  const profiles = [...params.profiles].sort((a, b) => a.zRatio - b.zRatio);
  const zPositions = profiles.map((profile) => profile.zRatio * params.heightMm);
  const sharedFacetSeamVertex = shouldKeepFacetEdgeSeamIdentity(profiles)
    ? computeSharedFacetSeamVertexIndex(profiles)
    : null;

  const contours = profiles.map((profile) =>
    sharedFacetSeamVertex === null
      ? buildProfileContour(profile, params.radialSamples)
      : buildProfileContourFromVertex(profile, params.radialSamples, sharedFacetSeamVertex),
  );

  return { zPositions, contours };
}

function interpolateOuterContourAtHeight(
  zMm: number,
  orderedContours: ReturnType<typeof buildOrderedContours>,
): Float64Array {
  const { zPositions, contours } = orderedContours;

  if (zMm <= zPositions[0]) {
    return new Float64Array(contours[0]);
  }
  if (zMm >= zPositions[zPositions.length - 1]) {
    return new Float64Array(contours[contours.length - 1]);
  }

  for (let index = 0; index < zPositions.length - 1; index++) {
    const zStart = zPositions[index];
    const zEnd = zPositions[index + 1];
    if (zStart <= zMm && zMm <= zEnd) {
      if (zEnd === zStart) {
        return new Float64Array(contours[index]);
      }

      const interpolation = (zMm - zStart) / (zEnd - zStart);
      return interpolateContours(contours[index], contours[index + 1], interpolation);
    }
  }

  return new Float64Array(contours[contours.length - 1]);
}

function pointInPolygon(contour: Float64Array, x: number, y: number): boolean {
  const count = contour.length / 2;
  let isInside = false;

  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const xi = contour[index * 2];
    const yi = contour[index * 2 + 1];
    const xj = contour[previous * 2];
    const yj = contour[previous * 2 + 1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const squaredLength = abx * abx + aby * aby;

  if (squaredLength <= Number.EPSILON) {
    return Math.hypot(px - ax, py - ay);
  }

  const projected = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / squaredLength));
  const closestX = ax + projected * abx;
  const closestY = ay + projected * aby;
  return Math.hypot(px - closestX, py - closestY);
}

function distanceToPolygonEdges(contour: Float64Array, x: number, y: number): number {
  const count = contour.length / 2;
  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index++) {
    const nextIndex = (index + 1) % count;
    minimumDistance = Math.min(
      minimumDistance,
      distancePointToSegment(
        x,
        y,
        contour[index * 2],
        contour[index * 2 + 1],
        contour[nextIndex * 2],
        contour[nextIndex * 2 + 1],
      ),
    );
  }

  return minimumDistance;
}

function computeLargestInscribedCircleDiameter(contour: Float64Array): number {
  const count = contour.length / 2;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < count; index++) {
    const x = contour[index * 2];
    const y = contour[index * 2 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    centroidX += x;
    centroidY += y;
  }

  centroidX /= count;
  centroidY /= count;

  const evaluate = (x: number, y: number): number =>
    pointInPolygon(contour, x, y) ? distanceToPolygonEdges(contour, x, y) : -1;

  let bestX = centroidX;
  let bestY = centroidY;
  let bestRadius = evaluate(bestX, bestY);

  const coarseGrid = 18;
  for (let xIndex = 0; xIndex <= coarseGrid; xIndex++) {
    const x = minX + ((maxX - minX) * xIndex) / coarseGrid;
    for (let yIndex = 0; yIndex <= coarseGrid; yIndex++) {
      const y = minY + ((maxY - minY) * yIndex) / coarseGrid;
      const radius = evaluate(x, y);
      if (radius > bestRadius) {
        bestRadius = radius;
        bestX = x;
        bestY = y;
      }
    }
  }

  let step = Math.max(maxX - minX, maxY - minY) / 4;
  for (let iteration = 0; iteration < 6; iteration++) {
    let iterationBestX = bestX;
    let iterationBestY = bestY;
    let iterationBestRadius = bestRadius;

    for (const offsetX of [-step, 0, step]) {
      for (const offsetY of [-step, 0, step]) {
        const x = bestX + offsetX;
        const y = bestY + offsetY;
        const radius = evaluate(x, y);
        if (radius > iterationBestRadius) {
          iterationBestRadius = radius;
          iterationBestX = x;
          iterationBestY = y;
        }
      }
    }

    bestX = iterationBestX;
    bestY = iterationBestY;
    bestRadius = iterationBestRadius;
    step *= 0.5;
  }

  return Math.max(0, bestRadius * 2);
}

function buildInnerAvailabilityProfile(params: VaseParameters) {
  const bottomZ = Math.max(0, Math.min(params.bottomThicknessMm, params.heightMm));
  const topZ = params.heightMm;
  const zValues = new Float64Array(INSERT_SECTION_SAMPLES);
  const availableDiameters = new Float64Array(INSERT_SECTION_SAMPLES);
  const orderedContours = buildOrderedContours(params);

  for (let index = 0; index < zValues.length; index++) {
    const ratio = zValues.length === 1 ? 1 : index / (zValues.length - 1);
    const zMm = bottomZ + (topZ - bottomZ) * ratio;
    zValues[index] = zMm;

    const outerContour = interpolateOuterContourAtHeight(zMm, orderedContours);
    const innerContour = computeInnerContour(outerContour, params.wallThicknessMm);
    availableDiameters[index] = computeLargestInscribedCircleDiameter(innerContour);
  }

  return {
    bottomZ,
    topZ,
    zValues,
    availableDiameters,
  };
}

function getInterpolatedAvailableDiameter(
  zMm: number,
  availabilityProfile: ReturnType<typeof buildInnerAvailabilityProfile>,
): number {
  const { zValues, availableDiameters } = availabilityProfile;
  if (zMm <= zValues[0]) {
    return availableDiameters[0];
  }
  if (zMm >= zValues[zValues.length - 1]) {
    return availableDiameters[availableDiameters.length - 1];
  }

  for (let index = 0; index < zValues.length - 1; index++) {
    const zStart = zValues[index];
    const zEnd = zValues[index + 1];
    if (zStart <= zMm && zMm <= zEnd) {
      if (zEnd === zStart) {
        return availableDiameters[index];
      }

      const interpolation = (zMm - zStart) / (zEnd - zStart);
      return availableDiameters[index] * (1 - interpolation) + availableDiameters[index + 1] * interpolation;
    }
  }

  return availableDiameters[availableDiameters.length - 1];
}

function getPresetDiameterAtDepth(preset: InsertPreset, depthFromTopMm: number): number {
  const bottomDiameterMm = preset.bottomDiameterMm ?? preset.topDiameterMm;
  if (preset.heightMm <= Number.EPSILON) {
    return Math.max(preset.topDiameterMm, bottomDiameterMm);
  }

  const ratio = Math.max(0, Math.min(1, depthFromTopMm / preset.heightMm));
  return preset.topDiameterMm * (1 - ratio) + bottomDiameterMm * ratio;
}

function isPresetCompatible(
  preset: InsertPreset,
  availabilityProfile: ReturnType<typeof buildInnerAvailabilityProfile>,
): boolean {
  const availableDepthMm = availabilityProfile.topZ - availabilityProfile.bottomZ;
  if (availableDepthMm + INSERT_DIAMETER_TOLERANCE_MM < preset.heightMm) {
    return false;
  }

  const openingDiameter = getInterpolatedAvailableDiameter(availabilityProfile.topZ, availabilityProfile);
  const largestPresetDiameter = Math.max(preset.topDiameterMm, preset.bottomDiameterMm ?? preset.topDiameterMm);
  if (openingDiameter + INSERT_DIAMETER_TOLERANCE_MM < largestPresetDiameter) {
    return false;
  }

  for (let sampleIndex = 0; sampleIndex <= INSERT_FIT_SAMPLES; sampleIndex++) {
    const ratio = sampleIndex / INSERT_FIT_SAMPLES;
    const depthFromTopMm = preset.heightMm * ratio;
    const zMm = availabilityProfile.topZ - depthFromTopMm;
    const availableDiameter = getInterpolatedAvailableDiameter(zMm, availabilityProfile);
    const requiredDiameter = getPresetDiameterAtDepth(preset, depthFromTopMm);
    if (availableDiameter + INSERT_DIAMETER_TOLERANCE_MM < requiredDiameter) {
      return false;
    }
  }

  return true;
}

export function analyzeWaterproofInsertCompatibility(params: VaseParameters): WaterproofInsertCompatibility {
  const availabilityProfile = buildInnerAvailabilityProfile(params);

  for (const preset of INSERT_PRESETS) {
    if (isPresetCompatible(preset, availabilityProfile)) {
      return {
        presetId: preset.id,
        label: preset.label,
        type: preset.type,
      };
    }
  }

  const fallbackPreset = INSERT_PRESETS[INSERT_PRESETS.length - 1];
  return {
    presetId: fallbackPreset.id,
    label: fallbackPreset.label,
    type: fallbackPreset.type,
  };
}
