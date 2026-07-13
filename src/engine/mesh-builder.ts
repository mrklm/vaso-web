import type { VaseParameters, MeshData } from "./types";
import {
  appendPipelineTrace,
  dumpPipelineTrace,
  getPipelineTrace,
  resetPipelineTrace,
} from "./pipeline-trace";
import { validateParams } from "./validation";
import {
  alignContourToPrevious,
  buildProfileContour,
  buildProfileContourFromVertex,
  interpolateContours,
  regularPolygonVertices,
} from "./geometry";
import { applyTexture } from "./textures";
import {
  maxSupportlessRadialStep,
  limitContourStepFromPrevious,
  computeInnerContour,
} from "./constraints";
import {
  getMeshDifferenceDiagnostics,
  logMeshDiagnostics,
  removeDegenerateTriangles,
} from "./mesh-cleanup";
import { analyzeWaterproofInsertCompatibility } from "./insert-compatibility";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";
const ENGRAVING_PIPELINE_MARKER = `Vaso Engraving ${APP_VERSION}`;
const FACETED_SEAM_MAX_PROFILE_SIDES = 12;
const SEAM_BACK_ANGLE_RAD = -Math.PI / 2;
const TEST_TUBE_SUPPORT_INNER_RADIUS_MM = 7.5;
const TEST_TUBE_SUPPORT_THICKNESS_MM = 2;
const TEST_TUBE_SUPPORT_OUTER_RADIUS_MM =
  TEST_TUBE_SUPPORT_INNER_RADIUS_MM + TEST_TUBE_SUPPORT_THICKNESS_MM;
const TEST_TUBE_SUPPORT_TOP_INSET_MM = 12;
const TEST_TUBE_SUPPORT_MIN_HEIGHT_MM = 38;
const TEST_TUBE_SUPPORT_SLOT_COUNT = 3;
const TEST_TUBE_SUPPORT_SLOT_ANGLE_RAD = Math.PI / 9;
const TEST_TUBE_SUPPORT_SEGMENTS_PER_SECTION = 18;
const TEST_TUBE_SUPPORT_WALL_MARGIN_MM = 0.8;
const TEST_TUBE_SUPPORT_ENGRAVING_CLEARANCE_MM = 2.5;

interface GenerateVaseMeshOptions {
  includeTestTubeSupport?: boolean;
}

function hasActiveTexture(params: VaseParameters): boolean {
  if (params.textureMode === "Pas de texture") return false;
  if (params.textureMode === "Double texture") {
    return params.textureType !== "Aucune" || params.textureType2 !== "Aucune";
  }
  return params.textureType !== "Aucune";
}

function shouldKeepFacetEdgeSeamIdentity(profiles: VaseParameters["profiles"]): boolean {
  if (profiles.length === 0) return false;
  const firstSides = profiles[0].sides;
  return (
    firstSides <= FACETED_SEAM_MAX_PROFILE_SIDES &&
    profiles.every((profile) => profile.sides === firstSides)
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
      score += normalizedAngularDistance(angle, SEAM_BACK_ANGLE_RAD);
    }

    if (score < bestScore) {
      bestScore = score;
      bestIndex = vertexIndex;
    }
  }

  return bestIndex;
}

function linspace(start: number, end: number, count: number): Float64Array {
  const result = new Float64Array(count);
  if (count <= 1) {
    result[0] = start;
    return result;
  }
  const step = (end - start) / (count - 1);
  for (let i = 0; i < count; i++) result[i] = start + step * i;
  return result;
}

function scaleMeshData(mesh: MeshData, scale: number): MeshData {
  const scaledVertices = new Float32Array(mesh.vertices.length);
  for (let i = 0; i < mesh.vertices.length; i++) {
    scaledVertices[i] = mesh.vertices[i] * scale;
  }
  return {
    vertices: scaledVertices,
    indices: mesh.indices,
  };
}

function pointInContour(contour: Float64Array, x: number, y: number): boolean {
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

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const squaredLength = abx * abx + aby * aby;

  if (squaredLength <= Number.EPSILON) {
    return Math.hypot(px - ax, py - ay);
  }

  const projected = Math.max(0, Math.min(1, (apx * abx + apy * aby) / squaredLength));
  return Math.hypot(px - (ax + projected * abx), py - (ay + projected * aby));
}

function distanceFromOriginToContourEdges(contour: Float64Array): number {
  const count = contour.length / 2;
  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index++) {
    const nextIndex = (index + 1) % count;
    minimumDistance = Math.min(
      minimumDistance,
      distanceToSegment(
        0,
        0,
        contour[index * 2],
        contour[index * 2 + 1],
        contour[nextIndex * 2],
        contour[nextIndex * 2 + 1],
      ),
    );
  }

  return minimumDistance;
}

function interpolatedOuterContour(params: VaseParameters, zMm: number): Float64Array {
  const profiles = [...params.profiles].sort((a, b) => a.zRatio - b.zRatio);
  const zPositions = profiles.map((p) => p.zRatio * params.heightMm);
  const sharedFacetSeamVertex = shouldKeepFacetEdgeSeamIdentity(profiles)
    ? computeSharedFacetSeamVertexIndex(profiles)
    : null;
  const contours = profiles.map((p) =>
    sharedFacetSeamVertex === null
      ? buildProfileContour(p, params.radialSamples)
      : buildProfileContourFromVertex(p, params.radialSamples, sharedFacetSeamVertex),
  );

  if (zMm <= zPositions[0]) {
    return applyTexture(new Float64Array(contours[0]), zMm, params);
  }
  if (zMm >= zPositions[zPositions.length - 1]) {
    return applyTexture(new Float64Array(contours[contours.length - 1]), zMm, params);
  }

  for (let i = 0; i < zPositions.length - 1; i++) {
    const z1 = zPositions[i],
      z2 = zPositions[i + 1];
    if (z1 <= zMm && zMm <= z2) {
      if (z2 === z1) return applyTexture(new Float64Array(contours[i]), zMm, params);
      const t = (zMm - z1) / (z2 - z1);
      const contour = interpolateContours(contours[i], contours[i + 1], t);
      return applyTexture(contour, zMm, params);
    }
  }

  return applyTexture(new Float64Array(contours[contours.length - 1]), zMm, params);
}

function generateSupportSafeOuterContours(
  params: VaseParameters,
  zValues: Float64Array,
): Float64Array[] {
  const contours: Float64Array[] = [];
  let previous: Float64Array | null = null;
  let previousZ: number | null = null;
  const texturedSeam = hasActiveTexture(params);

  for (let i = 0; i < zValues.length; i++) {
    const zMm = zValues[i];
    let contour = interpolatedOuterContour(params, zMm);

    if (previous !== null && previousZ !== null) {
      if (!texturedSeam) {
        contour = alignContourToPrevious(contour, previous);
      }
      const dz = Math.abs(zMm - previousZ);
      const maxStep = maxSupportlessRadialStep(dz);
      contour = limitContourStepFromPrevious(previous, contour, maxStep, params.wallThicknessMm);
    }

    contours.push(contour);
    previous = contour;
    previousZ = zMm;
  }

  return contours;
}

function buildInnerWallSourceContours(
  outerContours: Float64Array[],
  zOuter: Float64Array,
  zInnerBottom: number,
): { zInner: number[]; sourceContours: Float64Array[] } {
  const zInner: number[] = [];
  const sourceContours: Float64Array[] = [];
  const height = zOuter[zOuter.length - 1] ?? 0;
  const clampedBottom = Math.max(0, Math.min(zInnerBottom, height));
  const epsilon = 1e-9;

  if (clampedBottom >= height - epsilon) {
    return {
      zInner: [height],
      sourceContours: [new Float64Array(outerContours[outerContours.length - 1])],
    };
  }

  let insertedBottom = false;
  for (let layer = 0; layer < zOuter.length; layer++) {
    const z = zOuter[layer];

    if (!insertedBottom && clampedBottom > epsilon && z > clampedBottom + epsilon) {
      const lowerLayer = Math.max(0, layer - 1);
      const z1 = zOuter[lowerLayer];
      const z2 = z;
      const t = z2 === z1 ? 0 : (clampedBottom - z1) / (z2 - z1);
      sourceContours.push(interpolateContours(outerContours[lowerLayer], outerContours[layer], t));
      zInner.push(clampedBottom);
      insertedBottom = true;
    }

    if (z >= clampedBottom - epsilon) {
      sourceContours.push(new Float64Array(outerContours[layer]));
      zInner.push(z);
      insertedBottom = insertedBottom || Math.abs(z - clampedBottom) <= epsilon;
    }
  }

  if (!insertedBottom) {
    sourceContours.unshift(new Float64Array(outerContours[0]));
    zInner.unshift(clampedBottom);
  }

  return { zInner, sourceContours };
}

function addSegmentedTubeSupport(
  verts: number[],
  faces: number[],
  innerRadius: number,
  outerRadius: number,
  zBottom: number,
  zTop: number,
  slotCount: number,
  slotAngleRad: number,
  segmentsPerSection: number,
) {
  if (
    innerRadius <= 0 ||
    outerRadius <= innerRadius ||
    zTop <= zBottom ||
    slotCount < 1 ||
    slotAngleRad <= 0 ||
    segmentsPerSection < 1
  ) {
    return;
  }

  const sectionAngle = (Math.PI * 2) / slotCount;
  const arcAngle = sectionAngle - slotAngleRad;
  if (arcAngle <= 0) {
    return;
  }

  for (let sectionIndex = 0; sectionIndex < slotCount; sectionIndex += 1) {
    const sectionCenterAngle = sectionIndex * sectionAngle;
    const startAngle = sectionCenterAngle - arcAngle / 2;
    const angleStep = arcAngle / segmentsPerSection;
    const outerBottomStart = verts.length / 3;

    for (let index = 0; index <= segmentsPerSection; index += 1) {
      const angle = startAngle + angleStep * index;
      verts.push(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, zBottom);
    }

    const outerTopStart = verts.length / 3;
    for (let index = 0; index <= segmentsPerSection; index += 1) {
      const angle = startAngle + angleStep * index;
      verts.push(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, zTop);
    }

    const innerBottomStart = verts.length / 3;
    for (let index = 0; index <= segmentsPerSection; index += 1) {
      const angle = startAngle + angleStep * index;
      verts.push(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, zBottom);
    }

    const innerTopStart = verts.length / 3;
    for (let index = 0; index <= segmentsPerSection; index += 1) {
      const angle = startAngle + angleStep * index;
      verts.push(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, zTop);
    }

    for (let index = 0; index < segmentsPerSection; index += 1) {
      const outerBottomA = outerBottomStart + index;
      const outerBottomB = outerBottomStart + index + 1;
      const outerTopA = outerTopStart + index;
      const outerTopB = outerTopStart + index + 1;
      const innerBottomA = innerBottomStart + index;
      const innerBottomB = innerBottomStart + index + 1;
      const innerTopA = innerTopStart + index;
      const innerTopB = innerTopStart + index + 1;

      faces.push(outerBottomA, outerBottomB, outerTopA, outerBottomB, outerTopB, outerTopA);
      faces.push(innerBottomA, innerTopA, innerBottomB, innerBottomB, innerTopA, innerTopB);
      faces.push(outerTopA, outerTopB, innerTopA, outerTopB, innerTopB, innerTopA);
      faces.push(
        outerBottomA,
        innerBottomA,
        outerBottomB,
        outerBottomB,
        innerBottomA,
        innerBottomB,
      );
    }

    const startOuterBottom = outerBottomStart;
    const startOuterTop = outerTopStart;
    const startInnerBottom = innerBottomStart;
    const startInnerTop = innerTopStart;
    faces.push(
      startOuterBottom,
      startOuterTop,
      startInnerBottom,
      startInnerBottom,
      startOuterTop,
      startInnerTop,
    );

    const endOuterBottom = outerBottomStart + segmentsPerSection;
    const endOuterTop = outerTopStart + segmentsPerSection;
    const endInnerBottom = innerBottomStart + segmentsPerSection;
    const endInnerTop = innerTopStart + segmentsPerSection;
    faces.push(
      endOuterBottom,
      endInnerBottom,
      endOuterTop,
      endInnerBottom,
      endInnerTop,
      endOuterTop,
    );
  }
}

function canFitCenteredTestTubeSupport(
  params: VaseParameters,
  zValues: readonly number[],
  requiredRadius: number,
): boolean {
  for (const zMm of zValues) {
    const outerContour = interpolatedOuterContour(params, zMm);
    const innerContour = computeInnerContour(outerContour, params.wallThicknessMm);
    if (!pointInContour(innerContour, 0, 0)) {
      return false;
    }

    if (
      distanceFromOriginToContourEdges(innerContour) <
      requiredRadius + TEST_TUBE_SUPPORT_WALL_MARGIN_MM
    ) {
      return false;
    }
  }

  return true;
}

function addTestTubeSupportIfNeeded(
  params: VaseParameters,
  verts: number[],
  faces: number[],
  zInnerBottom: number,
  options: GenerateVaseMeshOptions = {},
) {
  if (options.includeTestTubeSupport === false) {
    return;
  }

  const compatibility = analyzeWaterproofInsertCompatibility(params);
  if (compatibility.type !== "test_tube") {
    return;
  }

  const supportBottomZ = zInnerBottom;
  const supportTopZ = Math.min(
    params.heightMm - 1,
    Math.max(
      supportBottomZ + TEST_TUBE_SUPPORT_MIN_HEIGHT_MM,
      params.heightMm - TEST_TUBE_SUPPORT_TOP_INSET_MM,
    ),
  );

  if (supportTopZ <= supportBottomZ) {
    return;
  }

  const fitSamples = [
    supportBottomZ + 0.5,
    supportBottomZ + (supportTopZ - supportBottomZ) * 0.33,
    supportBottomZ + (supportTopZ - supportBottomZ) * 0.66,
    supportTopZ,
  ];
  if (!canFitCenteredTestTubeSupport(params, fitSamples, TEST_TUBE_SUPPORT_OUTER_RADIUS_MM)) {
    return;
  }

  addSegmentedTubeSupport(
    verts,
    faces,
    TEST_TUBE_SUPPORT_INNER_RADIUS_MM,
    TEST_TUBE_SUPPORT_OUTER_RADIUS_MM,
    supportBottomZ,
    supportTopZ,
    TEST_TUBE_SUPPORT_SLOT_COUNT,
    TEST_TUBE_SUPPORT_SLOT_ANGLE_RAD,
    TEST_TUBE_SUPPORT_SEGMENTS_PER_SECTION,
  );
}

function addFlatInnerBottomCap(
  verts: number[],
  faces: number[],
  innerBottomStart: number,
  segments: number,
  zInnerBottom: number,
) {
  const innerCenter = verts.length / 3;
  verts.push(0, 0, zInnerBottom);
  for (let i = 0; i < segments; i++) {
    const a = innerBottomStart + i;
    const b = innerBottomStart + ((i + 1) % segments);
    faces.push(innerCenter, a, b);
  }
}

function addInnerBottomCap(
  params: VaseParameters,
  verts: number[],
  faces: number[],
  innerBottomStart: number,
  zInnerBottom: number,
  options: GenerateVaseMeshOptions,
) {
  addFlatInnerBottomCap(verts, faces, innerBottomStart, params.radialSamples, zInnerBottom);
  addTestTubeSupportIfNeeded(params, verts, faces, zInnerBottom, options);
}

/**
 * Generate the full vase mesh. Returns vertices (Float32Array, xyz flat) and indices (Uint32Array).
 */
export function generateVaseMesh(
  params: VaseParameters,
  options: GenerateVaseMeshOptions = {},
): MeshData {
  return generateVaseMeshInternal(params, options);
}

function generateVaseMeshInternal(
  params: VaseParameters,
  options: GenerateVaseMeshOptions = {},
): MeshData {
  validateParams(params);

  const ringSize = params.radialSamples;
  const layers = params.verticalSamples;

  const zOuter = linspace(0, params.heightMm, layers);
  const zInnerBottom = Math.min(params.bottomThicknessMm, params.heightMm);
  const outerContours = generateSupportSafeOuterContours(params, zOuter);
  const { zInner, sourceContours: innerSourceContours } = buildInnerWallSourceContours(
    outerContours,
    zOuter,
    zInnerBottom,
  );

  const verts: number[] = [];
  const faces: number[] = [];

  const outerRingStarts: number[] = [];
  const innerRingStarts: number[] = [];

  // Outer wall vertices
  for (let layer = 0; layer < layers; layer++) {
    const ringStart = verts.length / 3;
    const contour = outerContours[layer];
    const z = zOuter[layer];
    for (let i = 0; i < ringSize; i++) {
      verts.push(contour[i * 2], contour[i * 2 + 1], z);
    }
    outerRingStarts.push(ringStart);
  }

  // Inner wall vertices
  for (let layer = 0; layer < zInner.length; layer++) {
    const innerContour = computeInnerContour(innerSourceContours[layer], params.wallThicknessMm);
    const ringStart = verts.length / 3;
    const z = zInner[layer];
    for (let i = 0; i < ringSize; i++) {
      verts.push(innerContour[i * 2], innerContour[i * 2 + 1], z);
    }
    innerRingStarts.push(ringStart);
  }

  // Helper: add quad strip faces between two rings
  function addQuadStrip(startA: number, startB: number, size: number, flip: boolean) {
    for (let i = 0; i < size; i++) {
      const a = startA + i;
      const b = startA + ((i + 1) % size);
      const c = startB + i;
      const d = startB + ((i + 1) % size);
      if (!flip) {
        faces.push(a, b, c, b, d, c);
      } else {
        faces.push(a, c, b, b, c, d);
      }
    }
  }

  // Outer wall faces
  for (let layer = 0; layer < layers - 1; layer++) {
    addQuadStrip(outerRingStarts[layer], outerRingStarts[layer + 1], ringSize, false);
  }

  // Inner wall faces (flipped)
  for (let layer = 0; layer < zInner.length - 1; layer++) {
    addQuadStrip(innerRingStarts[layer], innerRingStarts[layer + 1], ringSize, true);
  }

  // Top lip bridge
  {
    const outerTop = outerRingStarts[layers - 1];
    const innerTop = innerRingStarts[innerRingStarts.length - 1];
    for (let i = 0; i < ringSize; i++) {
      const o0 = outerTop + i;
      const o1 = outerTop + ((i + 1) % ringSize);
      const i0 = innerTop + i;
      const i1 = innerTop + ((i + 1) % ringSize);
      faces.push(o0, o1, i0, o1, i1, i0);
    }
  }

  // Bottom cap
  if (params.closeBottom) {
    const outerBottom = outerRingStarts[0];
    const outerCenter = verts.length / 3;
    verts.push(0, 0, 0);
    for (let i = 0; i < ringSize; i++) {
      const a = outerBottom + i;
      const b = outerBottom + ((i + 1) % ringSize);
      faces.push(outerCenter, b, a);
    }

    // Inner bottom floor cap
    const innerBottom = innerRingStarts[0];
    addInnerBottomCap(
      params,
      verts,
      faces,
      innerBottom,
      zInnerBottom,
      options,
    );
  }

  return removeDegenerateTriangles({
    vertices: new Float32Array(verts),
    indices: new Uint32Array(faces),
  });
}

export async function generateVaseMeshWithEngraving(
  params: VaseParameters,
  seed: number,
  isSeedModified = false,
  options: GenerateVaseMeshOptions = {},
): Promise<MeshData> {
  validateParams(params);
  resetPipelineTrace();

  try {
    const { engraveBaseText } = await import("./engraving");
    const zOuter = linspace(0, params.heightMm, params.verticalSamples);
    const outerContours = generateSupportSafeOuterContours(params, zOuter);
    const mesh = generateVaseMeshInternal(params, options);
    logMeshDiagnostics("[mesh-builder] base mesh", mesh);
    appendPipelineTrace(
      `[mesh-builder] base mesh:v=${mesh.vertices.length / 3},t=${mesh.indices.length / 3}`,
    );
    const shouldReserveSupportCenter =
      options.includeTestTubeSupport !== false &&
      analyzeWaterproofInsertCompatibility(params).type === "test_tube";
    const engravedMesh = await engraveBaseText(
      mesh,
      params,
      outerContours[0],
      seed,
      isSeedModified,
      shouldReserveSupportCenter
        ? TEST_TUBE_SUPPORT_OUTER_RADIUS_MM + TEST_TUBE_SUPPORT_ENGRAVING_CLEARANCE_MM
        : 0,
    );
    const difference = getMeshDifferenceDiagnostics(mesh, engravedMesh);
    appendPipelineTrace(
      `[mesh-builder] final compare vs base:identical=${difference.identical ? 1 : 0},sharedT=${difference.sharedTriangles},removedT=${difference.removedTriangles},addedT=${difference.addedTriangles},sharedRatio=${difference.sharedTriangleRatio.toFixed(4)}`,
    );
    if (
      difference.identical ||
      (difference.addedTriangles === 0 && difference.removedTriangles === 0)
    ) {
      dumpPipelineTrace(ENGRAVING_PIPELINE_MARKER);
      throw new Error(
        `Engraving pipeline produced a mesh identical to the base mesh. trace=${getPipelineTrace()}`,
      );
    }

    // Apply global scale
    const scaledMesh = scaleMeshData(engravedMesh, params.scale);
    appendPipelineTrace(`[mesh-builder] applied scale=${params.scale.toFixed(3)}`);
    return scaledMesh;
  } catch (error) {
    appendPipelineTrace(
      `[mesh-builder] engraving error=${error instanceof Error ? error.message : String(error)}`,
    );
    dumpPipelineTrace(ENGRAVING_PIPELINE_MARKER);
    throw error instanceof Error
      ? error
      : new Error(`Engraving pipeline failed. trace=${getPipelineTrace()}`);
  }
}

/**
 * Generate outer profile points for the 2D side silhouette view.
 */
export function generateOuterProfilePoints(
  params: VaseParameters,
  samplesZ = 200,
): { zValues: Float64Array; radiusValues: Float64Array } {
  validateParams(params);
  const zValues = linspace(0, params.heightMm, samplesZ);
  const contours = generateSupportSafeOuterContours(params, zValues);
  const radiusValues = new Float64Array(samplesZ);

  for (let j = 0; j < samplesZ; j++) {
    const contour = contours[j];
    const n = contour.length / 2;
    let maxR = 0;
    for (let i = 0; i < n; i++) {
      const x = contour[i * 2],
        y = contour[i * 2 + 1];
      const r = Math.sqrt(x * x + y * y);
      if (r > maxR) maxR = r;
    }
    radiusValues[j] = maxR;
  }

  return { zValues, radiusValues };
}

/**
 * Generate the top outer contour for the 2D top-down view.
 */
export function generateTopOuterContour(params: VaseParameters): Float64Array {
  validateParams(params);
  const layers = Math.max(2, params.verticalSamples);
  const zValues = linspace(0, params.heightMm, layers);
  const contours = generateSupportSafeOuterContours(params, zValues);
  return new Float64Array(contours[contours.length - 1]);
}
