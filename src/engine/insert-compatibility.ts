import {
  computeInnerContour,
  limitContourStepFromPrevious,
  maxSupportlessRadialStep,
} from "./constraints";
import {
  alignContourToPrevious,
  buildProfileContour,
  buildProfileContourFromVertex,
  interpolateContours,
  regularPolygonVertices,
} from "./geometry";
import { applyTexture, getMaxInwardTextureOffsetMm } from "./textures";
import type { Profile, VaseParameters } from "./types";

const FACETED_SEAM_MAX_PROFILE_SIDES = 12;
const INSERT_SECTION_SAMPLES = 96;
const INSERT_FIT_SAMPLES = 72;
const INSERT_DIAMETER_TOLERANCE_MM = 0.35;
const ECO_CUP_RIGID_MIN_CLEARANCE_MM = 0.5;
export const MIN_TEST_TUBE_VASE_HEIGHT_MM = 115;
export const TEST_TUBE_LONG_VASE_HEIGHT_MM = 140;
export const TEST_TUBE_TOP_CLEARANCE_MM = 20;
export const TEST_TUBE_SUPPORT_HEIGHT_MM = 40;
export const MIN_TEST_TUBE_TOP_OPENING_INNER_DIAMETER_MM = 29;

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
  type: "eco_cup" | "test_tube" | "none";
};

export const INSERT_PRESETS: readonly InsertPreset[] = [
  {
    id: "eco-cup-50cl",
    label: "Eco-Cup 50 cl",
    type: "eco_cup",
    heightMm: 163,
    topDiameterMm: 85,
    bottomDiameterMm: 64,
    clearanceMm: 3,
  },
  {
    id: "eco-cup-25cl",
    label: "Eco-Cup 25 cl",
    type: "eco_cup",
    heightMm: 115,
    topDiameterMm: 73,
    bottomDiameterMm: 55,
    clearanceMm: 3,
  },
  {
    id: "eco-cup-12-5cl",
    label: "Eco-Cup 12,5 cl",
    type: "eco_cup",
    heightMm: 95,
    topDiameterMm: 64,
    bottomDiameterMm: 50,
    clearanceMm: 3,
  },
  {
    id: "test-tube-100x25-4",
    label: "Tube à essai 100 × 25,4 mm",
    type: "test_tube",
    heightMm: 100,
    topDiameterMm: 25.4,
    bottomDiameterMm: 25.4,
    clearanceMm: 1.5,
  },
  {
    id: "test-tube-120x25-4",
    label: "Tube à essai 120 × 25,4 mm",
    type: "test_tube",
    heightMm: 120,
    topDiameterMm: 25.4,
    bottomDiameterMm: 25.4,
    clearanceMm: 1.5,
  },
] as const;

export function createCustomTestTubePreset(heightMm: number, diameterMm: number): InsertPreset {
  const safeHeight = Math.max(50, Math.trunc(heightMm));
  const safeDiameter = Math.max(10, Math.min(40, diameterMm));
  const formattedDiameter = safeDiameter.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return {
    id: "custom-test-tube",
    label: `Tube à essai ${safeHeight} × ${formattedDiameter} mm`,
    type: "test_tube",
    heightMm: safeHeight,
    topDiameterMm: safeDiameter,
    bottomDiameterMm: safeDiameter,
    clearanceMm: 0.2,
  };
}

export function getInsertPresetById(presetId: string): InsertPreset | null {
  return INSERT_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function getPreferredTestTubePreset(heightMm: number): InsertPreset {
  const preferredId =
    heightMm >= TEST_TUBE_LONG_VASE_HEIGHT_MM
      ? "test-tube-120x25-4"
      : "test-tube-100x25-4";
  return (
    INSERT_PRESETS.find((preset) => preset.id === preferredId) ??
    INSERT_PRESETS[INSERT_PRESETS.length - 1]
  );
}

export function getMinimumTestTubeProfileDiameterMm(
  profile: Pick<Profile, "sides" | "scaleX" | "scaleY">,
  wallThicknessMm: number,
  textureInsetMm = 0,
  minimumInnerDiameterMm = MIN_TEST_TUBE_TOP_OPENING_INNER_DIAMETER_MM,
): number {
  const sides = Math.max(3, Math.round(profile.sides));
  const minScale = Math.max(0.1, Math.min(Math.abs(profile.scaleX), Math.abs(profile.scaleY)));
  const apothemRatio = Math.cos(Math.PI / sides);
  const requiredOuterApothemMm =
    minimumInnerDiameterMm / 2 +
    Math.max(0, textureInsetMm) +
    Math.max(0, wallThicknessMm);

  return (requiredOuterApothemMm / apothemRatio / minScale) * 2;
}

function getMinimumTestTubeVaseHeightMm(preset?: InsertPreset): number {
  if (!preset) return MIN_TEST_TUBE_VASE_HEIGHT_MM;
  return Math.max(MIN_TEST_TUBE_VASE_HEIGHT_MM, preset.heightMm + TEST_TUBE_TOP_CLEARANCE_MM);
}

function getMinimumTestTubeInnerDiameterMm(preset?: InsertPreset): number {
  if (!preset) return MIN_TEST_TUBE_TOP_OPENING_INNER_DIAMETER_MM;
  return Math.max(
    MIN_TEST_TUBE_TOP_OPENING_INNER_DIAMETER_MM,
    preset.topDiameterMm + preset.clearanceMm * 2 + 0.6,
  );
}

export function enforceMinimumTestTubeCompatibility(
  params: VaseParameters,
  preset?: InsertPreset,
): VaseParameters {
  const wallThicknessMm = Math.max(0, params.wallThicknessMm);
  const textureInsetMm = getMaxInwardTextureOffsetMm(params);
  const minimumVaseHeightMm = getMinimumTestTubeVaseHeightMm(preset);
  const minimumInnerDiameterMm = getMinimumTestTubeInnerDiameterMm(preset);

  return {
    ...params,
    heightMm: Math.max(minimumVaseHeightMm, params.heightMm),
    profiles: params.profiles.map((profile) => ({
      ...profile,
      diameter: Math.max(
        profile.diameter,
        getMinimumTestTubeProfileDiameterMm(
          profile,
          wallThicknessMm,
          textureInsetMm,
          minimumInnerDiameterMm,
        ),
      ),
    })),
  };
}

export function getTestTubePlacement(params: VaseParameters, preset: InsertPreset) {
  const innerBottomZ = Math.min(params.bottomThicknessMm, params.heightMm);
  const targetTopZ = params.heightMm - TEST_TUBE_TOP_CLEARANCE_MM;
  const tubeBottomZ = Math.max(innerBottomZ, targetTopZ - preset.heightMm);
  const tubeTopZ = tubeBottomZ + preset.heightMm;
  const supportBottomZ = innerBottomZ;
  const supportTopZ = Math.min(
    params.heightMm - 1,
    tubeBottomZ + TEST_TUBE_SUPPORT_HEIGHT_MM,
    tubeTopZ,
  );

  return {
    tubeBottomZ,
    tubeTopZ,
    supportBottomZ,
    supportTopZ,
    pedestalBottomZ: innerBottomZ,
    pedestalTopZ: tubeBottomZ,
  };
}

function hasActiveTexture(params: VaseParameters): boolean {
  if (params.textureMode === "Pas de texture") return false;
  if (params.textureMode === "Double texture") {
    return params.textureType !== "Aucune" || params.textureType2 !== "Aucune";
  }
  return params.textureType !== "Aucune";
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

function buildOrderedContours(params: VaseParameters): {
  zPositions: number[];
  contours: Float64Array[];
} {
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
  params: VaseParameters,
): Float64Array {
  const { zPositions, contours } = orderedContours;

  if (zMm <= zPositions[0]) {
    return applyTexture(new Float64Array(contours[0]), zMm, params);
  }
  if (zMm >= zPositions[zPositions.length - 1]) {
    return applyTexture(new Float64Array(contours[contours.length - 1]), zMm, params);
  }

  for (let index = 0; index < zPositions.length - 1; index++) {
    const zStart = zPositions[index];
    const zEnd = zPositions[index + 1];
    if (zStart <= zMm && zMm <= zEnd) {
      if (zEnd === zStart) {
        return applyTexture(new Float64Array(contours[index]), zMm, params);
      }

      const interpolation = (zMm - zStart) / (zEnd - zStart);
      return applyTexture(
        interpolateContours(contours[index], contours[index + 1], interpolation),
        zMm,
        params,
      );
    }
  }

  return applyTexture(new Float64Array(contours[contours.length - 1]), zMm, params);
}

function pointInPolygon(contour: Float64Array, x: number, y: number): boolean {
  const count = contour.length / 2;
  let isInside = false;

  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const xi = contour[index * 2];
    const yi = contour[index * 2 + 1];
    const xj = contour[previous * 2];
    const yj = contour[previous * 2 + 1];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
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
  const innerContours: Float64Array[] = [];
  const orderedContours = buildOrderedContours(params);
  const texturedSeam = hasActiveTexture(params);
  let previousContour: Float64Array | null = null;
  let previousZ: number | null = null;

  for (let index = 0; index < zValues.length; index++) {
    const ratio = zValues.length === 1 ? 1 : index / (zValues.length - 1);
    const zMm = bottomZ + (topZ - bottomZ) * ratio;
    zValues[index] = zMm;

    let outerContour = interpolateOuterContourAtHeight(zMm, orderedContours, params);
    if (previousContour !== null && previousZ !== null) {
      if (!texturedSeam) {
        outerContour = alignContourToPrevious(outerContour, previousContour);
      }
      outerContour = limitContourStepFromPrevious(
        previousContour,
        outerContour,
        maxSupportlessRadialStep(Math.abs(zMm - previousZ)),
        params.wallThicknessMm,
      );
    }

    const innerContour = computeInnerContour(outerContour, params.wallThicknessMm);
    innerContours.push(innerContour);
    availableDiameters[index] = computeLargestInscribedCircleDiameter(innerContour);
    previousContour = outerContour;
    previousZ = zMm;
  }

  return {
    bottomZ,
    topZ,
    zValues,
    availableDiameters,
    innerContours,
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
      return (
        availableDiameters[index] * (1 - interpolation) +
        availableDiameters[index + 1] * interpolation
      );
    }
  }

  return availableDiameters[availableDiameters.length - 1];
}

function getPresetDiameterAtDepth(preset: InsertPreset, depthFromTopMm: number): number {
  const bottomDiameterMm = preset.bottomDiameterMm ?? preset.topDiameterMm;
  if (preset.heightMm <= Number.EPSILON) {
    return Math.max(preset.topDiameterMm, bottomDiameterMm) + preset.clearanceMm;
  }

  const ratio = Math.max(0, Math.min(1, depthFromTopMm / preset.heightMm));
  return preset.topDiameterMm * (1 - ratio) + bottomDiameterMm * ratio + preset.clearanceMm;
}

function getPresetRequiredHeight(preset: InsertPreset): number {
  return preset.type === "eco_cup" ? preset.heightMm + preset.clearanceMm : preset.heightMm;
}

function getInterpolatedInnerContour(
  zMm: number,
  availabilityProfile: ReturnType<typeof buildInnerAvailabilityProfile>,
): Float64Array {
  const { zValues, innerContours } = availabilityProfile;
  if (zMm <= zValues[0]) {
    return innerContours[0];
  }
  if (zMm >= zValues[zValues.length - 1]) {
    return innerContours[innerContours.length - 1];
  }

  for (let index = 0; index < zValues.length - 1; index++) {
    const zStart = zValues[index];
    const zEnd = zValues[index + 1];
    if (zStart <= zMm && zMm <= zEnd) {
      const startContour = innerContours[index];
      const endContour = innerContours[index + 1];
      if (zEnd === zStart || startContour.length !== endContour.length) {
        return startContour;
      }

      const interpolation = (zMm - zStart) / (zEnd - zStart);
      return interpolateContours(startContour, endContour, interpolation);
    }
  }

  return innerContours[innerContours.length - 1];
}

function getContourBounds(contour: Float64Array) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < contour.length / 2; index++) {
    const x = contour[index * 2];
    const y = contour[index * 2 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { minX, maxX, minY, maxY };
}

function getCenterClearanceForRigidInsert(
  contour: Float64Array,
  centerX: number,
  centerY: number,
  requiredRadius: number,
): number {
  return pointInPolygon(contour, centerX, centerY)
    ? distanceToPolygonEdges(contour, centerX, centerY) - requiredRadius
    : Number.NEGATIVE_INFINITY;
}

function computeRigidEcoCupFitClearance(
  preset: InsertPreset,
  availabilityProfile: ReturnType<typeof buildInnerAvailabilityProfile>,
): number {
  const requiredHeight = getPresetRequiredHeight(preset);
  const insertBottomZ = availabilityProfile.topZ - requiredHeight;
  if (insertBottomZ + INSERT_DIAMETER_TOLERANCE_MM < availabilityProfile.bottomZ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sampledSections = Array.from({ length: INSERT_FIT_SAMPLES + 1 }, (_, sampleIndex) => {
    const ratio = sampleIndex / INSERT_FIT_SAMPLES;
    const depthFromTopMm = requiredHeight * ratio;
    const zMm = availabilityProfile.topZ - depthFromTopMm;
    const presetDepthFromTopMm = Math.min(preset.heightMm, depthFromTopMm);
    return {
      contour: getInterpolatedInnerContour(zMm, availabilityProfile),
      requiredRadius: getPresetDiameterAtDepth(preset, presetDepthFromTopMm) / 2,
    };
  });

  const initialBounds = sampledSections.reduce(
    (bounds, section) => {
      const sectionBounds = getContourBounds(section.contour);
      return {
        minX: Math.max(bounds.minX, sectionBounds.minX + section.requiredRadius),
        maxX: Math.min(bounds.maxX, sectionBounds.maxX - section.requiredRadius),
        minY: Math.max(bounds.minY, sectionBounds.minY + section.requiredRadius),
        maxY: Math.min(bounds.maxY, sectionBounds.maxY - section.requiredRadius),
      };
    },
    {
      minX: Number.NEGATIVE_INFINITY,
      maxX: Number.POSITIVE_INFINITY,
      minY: Number.NEGATIVE_INFINITY,
      maxY: Number.POSITIVE_INFINITY,
    },
  );

  if (initialBounds.minX > initialBounds.maxX || initialBounds.minY > initialBounds.maxY) {
    return Number.NEGATIVE_INFINITY;
  }

  let bestCenter = {
    x: Math.max(initialBounds.minX, Math.min(0, initialBounds.maxX)),
    y: Math.max(initialBounds.minY, Math.min(0, initialBounds.maxY)),
    clearance: Number.NEGATIVE_INFINITY,
  };

  const evaluateCenter = (centerX: number, centerY: number): number => {
    let minimumClearance = Number.POSITIVE_INFINITY;
    for (const section of sampledSections) {
      minimumClearance = Math.min(
        minimumClearance,
        getCenterClearanceForRigidInsert(
          section.contour,
          centerX,
          centerY,
          section.requiredRadius,
        ),
      );
      if (minimumClearance < bestCenter.clearance - 8) {
        break;
      }
    }
    return minimumClearance;
  };

  for (const step of [4, 2, 1, 0.5]) {
    const minX =
      bestCenter.clearance === Number.NEGATIVE_INFINITY
        ? initialBounds.minX
        : Math.max(initialBounds.minX, bestCenter.x - step * 4);
    const maxX =
      bestCenter.clearance === Number.NEGATIVE_INFINITY
        ? initialBounds.maxX
        : Math.min(initialBounds.maxX, bestCenter.x + step * 4);
    const minY =
      bestCenter.clearance === Number.NEGATIVE_INFINITY
        ? initialBounds.minY
        : Math.max(initialBounds.minY, bestCenter.y - step * 4);
    const maxY =
      bestCenter.clearance === Number.NEGATIVE_INFINITY
        ? initialBounds.maxY
        : Math.min(initialBounds.maxY, bestCenter.y + step * 4);

    for (let x = minX; x <= maxX; x += step) {
      for (let y = minY; y <= maxY; y += step) {
        const clearance = evaluateCenter(x, y);
        if (clearance > bestCenter.clearance) {
          bestCenter = { x, y, clearance };
        }
      }
    }
  }

  return bestCenter.clearance;
}

function isPresetCompatible(
  preset: InsertPreset,
  availabilityProfile: ReturnType<typeof buildInnerAvailabilityProfile>,
  params: VaseParameters,
): boolean {
  const availableDepthMm = availabilityProfile.topZ - availabilityProfile.bottomZ;
  const requiredHeight = getPresetRequiredHeight(preset);
  if (availableDepthMm + INSERT_DIAMETER_TOLERANCE_MM < requiredHeight) {
    return false;
  }

  const openingDiameter = getInterpolatedAvailableDiameter(
    availabilityProfile.topZ,
    availabilityProfile,
  );
  const largestPresetDiameter =
    Math.max(preset.topDiameterMm, preset.bottomDiameterMm ?? preset.topDiameterMm) +
    preset.clearanceMm;
  if (openingDiameter + INSERT_DIAMETER_TOLERANCE_MM < largestPresetDiameter) {
    return false;
  }

  if (preset.type === "test_tube") {
    const placement = getTestTubePlacement(params, preset);
    if (
      placement.tubeBottomZ + INSERT_DIAMETER_TOLERANCE_MM < availabilityProfile.bottomZ ||
      placement.tubeTopZ > availabilityProfile.topZ + INSERT_DIAMETER_TOLERANCE_MM
    ) {
      return false;
    }

    for (let sampleIndex = 0; sampleIndex <= INSERT_FIT_SAMPLES; sampleIndex++) {
      const ratio = sampleIndex / INSERT_FIT_SAMPLES;
      const zMm = placement.tubeBottomZ * (1 - ratio) + placement.tubeTopZ * ratio;
      const availableDiameter = getInterpolatedAvailableDiameter(zMm, availabilityProfile);
      if (availableDiameter + INSERT_DIAMETER_TOLERANCE_MM < largestPresetDiameter) {
        return false;
      }
    }

    return true;
  }

  for (let sampleIndex = 0; sampleIndex <= INSERT_FIT_SAMPLES; sampleIndex++) {
    const ratio = sampleIndex / INSERT_FIT_SAMPLES;
    const depthFromTopMm = requiredHeight * ratio;
    const zMm = availabilityProfile.topZ - depthFromTopMm;
    const availableDiameter = getInterpolatedAvailableDiameter(zMm, availabilityProfile);
    const presetDepthFromTopMm = Math.min(preset.heightMm, depthFromTopMm);
    const requiredDiameter = getPresetDiameterAtDepth(preset, presetDepthFromTopMm);
    if (availableDiameter + INSERT_DIAMETER_TOLERANCE_MM < requiredDiameter) {
      return false;
    }
  }

  return computeRigidEcoCupFitClearance(preset, availabilityProfile) >= ECO_CUP_RIGID_MIN_CLEARANCE_MM;
}

export function analyzeWaterproofInsertCompatibility(
  params: VaseParameters,
  forcedTestTubePreset?: InsertPreset,
): WaterproofInsertCompatibility {
  const availabilityProfile = buildInnerAvailabilityProfile(params);

  if (forcedTestTubePreset) {
    return isPresetCompatible(forcedTestTubePreset, availabilityProfile, params)
      ? {
          presetId: forcedTestTubePreset.id,
          label: forcedTestTubePreset.label,
          type: forcedTestTubePreset.type,
        }
      : {
          presetId: "none",
          label: "Aucun contenant compatible",
          type: "none",
        };
  }

  for (const preset of INSERT_PRESETS) {
    if (preset.type === "eco_cup" && isPresetCompatible(preset, availabilityProfile, params)) {
      return {
        presetId: preset.id,
        label: preset.label,
        type: preset.type,
      };
    }
  }

  const testTubePreset = getPreferredTestTubePreset(params.heightMm);
  if (
    params.heightMm >= MIN_TEST_TUBE_VASE_HEIGHT_MM &&
    isPresetCompatible(testTubePreset, availabilityProfile, params)
  ) {
    return {
      presetId: testTubePreset.id,
      label: testTubePreset.label,
      type: testTubePreset.type,
    };
  }

  return {
    presetId: "none",
    label: "Aucun contenant compatible",
    type: "none",
  };
}
