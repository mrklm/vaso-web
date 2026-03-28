import type { VaseParameters, MeshData } from "./types";
import { appendPipelineTrace, dumpPipelineTrace, getPipelineTrace, resetPipelineTrace } from "./pipeline-trace";
import { validateParams } from "./validation";
import { buildProfileContour, interpolateContours } from "./geometry";
import { applyTexture } from "./textures";
import {
  maxSupportlessRadialStep,
  limitContourStepFromPrevious,
  computeInnerContour,
} from "./constraints";
import { getMeshDifferenceDiagnostics, logMeshDiagnostics } from "./mesh-cleanup";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";
const ENGRAVING_PIPELINE_MARKER = `Vaso Engraving ${APP_VERSION}`;

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

function interpolatedOuterContour(params: VaseParameters, zMm: number): Float64Array {
  const profiles = [...params.profiles].sort((a, b) => a.zRatio - b.zRatio);
  const zPositions = profiles.map((p) => p.zRatio * params.heightMm);
  const contours = profiles.map((p) => buildProfileContour(p, params.radialSamples));

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

  for (let i = 0; i < zValues.length; i++) {
    const zMm = zValues[i];
    let contour = interpolatedOuterContour(params, zMm);

    if (previous !== null && previousZ !== null) {
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

/**
 * Generate the full vase mesh. Returns vertices (Float32Array, xyz flat) and indices (Uint32Array).
 */
export function generateVaseMesh(params: VaseParameters): MeshData {
  return generateVaseMeshInternal(params);
}

function generateVaseMeshInternal(
  params: VaseParameters,
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
    const innerCenter = verts.length / 3;
    verts.push(0, 0, zInnerBottom);
    for (let i = 0; i < ringSize; i++) {
      const a = innerBottom + i;
      const b = innerBottom + ((i + 1) % ringSize);
      faces.push(innerCenter, a, b);
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(faces),
  };
}

export async function generateVaseMeshWithEngraving(
  params: VaseParameters,
  seed: number,
  isSeedModified = false,
): Promise<MeshData> {
  validateParams(params);
  resetPipelineTrace();

  try {
    const { engraveBaseText } = await import("./engraving");
    const zOuter = linspace(0, params.heightMm, params.verticalSamples);
    const outerContours = generateSupportSafeOuterContours(params, zOuter);
    const mesh = generateVaseMeshInternal(params);
    logMeshDiagnostics("[mesh-builder] base mesh", mesh);
    appendPipelineTrace(
      `[mesh-builder] base mesh:v=${mesh.vertices.length / 3},t=${mesh.indices.length / 3}`,
    );
    const engravedMesh = await engraveBaseText(mesh, params, outerContours[0], seed, isSeedModified);
    const difference = getMeshDifferenceDiagnostics(mesh, engravedMesh);
    appendPipelineTrace(
      `[mesh-builder] final compare vs base:identical=${difference.identical ? 1 : 0},sharedT=${difference.sharedTriangles},removedT=${difference.removedTriangles},addedT=${difference.addedTriangles},sharedRatio=${difference.sharedTriangleRatio.toFixed(4)}`,
    );
    if (difference.identical || (difference.addedTriangles === 0 && difference.removedTriangles === 0)) {
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
