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
const TEST_TUBE_GUIDE_INNER_RADIUS_MM = 6.5;
const TEST_TUBE_GUIDE_OUTER_RADIUS_MM = 8;
const TEST_TUBE_GUIDE_HEIGHT_MM = 4;
const TEST_TUBE_GUIDE_TOP_INSET_MM = 8;
const TEST_TUBE_ARM_COUNT = 3;
const TEST_TUBE_ARM_PATH_SAMPLES = 9;
const TEST_TUBE_RING_SEGMENTS = 36;
const TEST_TUBE_ARM_THICKNESS_MM = 1.8;
const TEST_TUBE_ARM_START_WIDTH_MM = 2.2;
const TEST_TUBE_ARM_END_WIDTH_MM = 12.4;
const TEST_TUBE_ARM_RING_OVERLAP_MM = 0.45;
const TEST_TUBE_ARM_WALL_ARC_SEGMENTS = 3;
const TEST_TUBE_ARM_RING_ARC_SEGMENTS = 7;
const TEST_TUBE_ARM_SECTION_POINTS = 7;
const TEST_TUBE_ARM_MIN_DROP_MM = 14;
const TEST_TUBE_ARM_MAX_DROP_MM = 28;
const TEST_TUBE_ARM_PRINTABLE_SLOPE_RATIO = 1.25;
const TEST_TUBE_ARM_MAX_RADIAL_SPAN_MM = 13;
const TEST_TUBE_RING_UNDER_SUPPORT_DROP_MM = 1.8;
const TEST_TUBE_SUPPORT_WALL_MARGIN_MM = 0.8;
const TEST_TUBE_GUIDE_WALL_MARGIN_MM = 0.25;

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

function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function findRayContourRadius(contour: Float64Array, angle: number): number | null {
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const count = contour.length / 2;
  let bestRadius = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index++) {
    const nextIndex = (index + 1) % count;
    const ax = contour[index * 2];
    const ay = contour[index * 2 + 1];
    const segmentX = contour[nextIndex * 2] - ax;
    const segmentY = contour[nextIndex * 2 + 1] - ay;
    const denominator = cross2D(directionX, directionY, segmentX, segmentY);

    if (Math.abs(denominator) <= Number.EPSILON) {
      continue;
    }

    const rayDistance = cross2D(ax, ay, segmentX, segmentY) / denominator;
    const segmentRatio = cross2D(ax, ay, directionX, directionY) / denominator;
    if (rayDistance >= 0 && segmentRatio >= 0 && segmentRatio <= 1) {
      bestRadius = Math.min(bestRadius, rayDistance);
    }
  }

  return Number.isFinite(bestRadius) ? bestRadius : null;
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

interface TestTubeSupportConfig {
  guideBottomZ: number;
  guideTopZ: number;
}

interface TestTubeSupportPoint {
  x: number;
  y: number;
  z: number;
}

function addClosedRing(
  verts: number[],
  faces: number[],
  innerRadius: number,
  outerRadius: number,
  zBottom: number,
  zTop: number,
  segments: number,
  includeBottomFace = true,
): { outerBottomStart: number; innerBottomStart: number } | null {
  if (innerRadius <= 0 || outerRadius <= innerRadius || zTop <= zBottom || segments < 3) {
    return null;
  }

  const outerBottomStart = verts.length / 3;
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    verts.push(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, zBottom);
  }

  const outerTopStart = verts.length / 3;
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    verts.push(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, zTop);
  }

  const innerBottomStart = verts.length / 3;
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    verts.push(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, zBottom);
  }

  const innerTopStart = verts.length / 3;
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    verts.push(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, zTop);
  }

  for (let index = 0; index < segments; index++) {
    const nextIndex = (index + 1) % segments;
    const outerBottomA = outerBottomStart + index;
    const outerBottomB = outerBottomStart + nextIndex;
    const outerTopA = outerTopStart + index;
    const outerTopB = outerTopStart + nextIndex;
    const innerBottomA = innerBottomStart + index;
    const innerBottomB = innerBottomStart + nextIndex;
    const innerTopA = innerTopStart + index;
    const innerTopB = innerTopStart + nextIndex;

    faces.push(outerBottomA, outerBottomB, outerTopA, outerBottomB, outerTopB, outerTopA);
    faces.push(innerBottomA, innerTopA, innerBottomB, innerBottomB, innerTopA, innerTopB);
    faces.push(outerTopA, outerTopB, innerTopA, outerTopB, innerTopB, innerTopA);
    if (includeBottomFace) {
      faces.push(
        outerBottomA,
        innerBottomA,
        outerBottomB,
        outerBottomB,
        innerBottomA,
        innerBottomB,
      );
    }
  }

  return { outerBottomStart, innerBottomStart };
}

function addRingUnderSupport(
  verts: number[],
  faces: number[],
  ringStarts: { outerBottomStart: number; innerBottomStart: number },
  segments: number,
  zBottom: number,
) {
  const lowerInnerStart = verts.length / 3;
  const lowerZ = zBottom - TEST_TUBE_RING_UNDER_SUPPORT_DROP_MM;

  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    verts.push(
      Math.cos(angle) * TEST_TUBE_GUIDE_INNER_RADIUS_MM,
      Math.sin(angle) * TEST_TUBE_GUIDE_INNER_RADIUS_MM,
      lowerZ,
    );
  }

  for (let index = 0; index < segments; index++) {
    const nextIndex = (index + 1) % segments;
    const lowerA = lowerInnerStart + index;
    const lowerB = lowerInnerStart + nextIndex;
    const innerA = ringStarts.innerBottomStart + index;
    const innerB = ringStarts.innerBottomStart + nextIndex;
    const outerA = ringStarts.outerBottomStart + index;
    const outerB = ringStarts.outerBottomStart + nextIndex;

    faces.push(lowerA, innerA, lowerB, lowerB, innerA, innerB);
    faces.push(lowerA, lowerB, outerA, lowerB, outerB, outerA);
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
      requiredRadius + TEST_TUBE_GUIDE_WALL_MARGIN_MM
    ) {
      return false;
    }
  }

  return true;
}

function buildTestTubeSupportConfig(
  params: VaseParameters,
  zInnerBottom: number,
): TestTubeSupportConfig | null {
  const compatibility = analyzeWaterproofInsertCompatibility(params);
  if (compatibility.type !== "test_tube") {
    return null;
  }

  const guideTopZ = Math.min(
    params.heightMm - 1,
    Math.max(
      zInnerBottom + TEST_TUBE_GUIDE_HEIGHT_MM + 1,
      params.heightMm - TEST_TUBE_GUIDE_TOP_INSET_MM,
    ),
  );
  const guideBottomZ = guideTopZ - TEST_TUBE_GUIDE_HEIGHT_MM;

  if (guideBottomZ <= zInnerBottom) {
    return null;
  }

  if (
    !canFitCenteredTestTubeSupport(
      params,
      [guideBottomZ, guideTopZ],
      TEST_TUBE_GUIDE_OUTER_RADIUS_MM,
    )
  ) {
    return null;
  }

  return {
    guideBottomZ,
    guideTopZ,
  };
}

function buildTestTubeSupportArmPath(
  params: VaseParameters,
  rootPoint: TestTubeSupportPoint,
  angle: number,
  guideBottomZ: number,
): TestTubeSupportPoint[] | null {
  if (guideBottomZ <= rootPoint.z) {
    return null;
  }

  const endRadius = TEST_TUBE_GUIDE_OUTER_RADIUS_MM + TEST_TUBE_ARM_RING_OVERLAP_MM;
  const rawStartRadius = Math.hypot(rootPoint.x, rootPoint.y);
  const startHalfWidth = TEST_TUBE_ARM_START_WIDTH_MM / 2;
  const startAvailableRadius = Math.max(0, rawStartRadius - TEST_TUBE_SUPPORT_WALL_MARGIN_MM);
  const wallSafeStartRadius = Math.sqrt(
    Math.max(0, startAvailableRadius * startAvailableRadius - startHalfWidth * startHalfWidth),
  );
  const startRadius = Math.min(
    wallSafeStartRadius,
    TEST_TUBE_GUIDE_OUTER_RADIUS_MM + TEST_TUBE_ARM_MAX_RADIAL_SPAN_MM,
  );
  const span = startRadius - endRadius;
  if (span <= Number.EPSILON) {
    return null;
  }

  let spanScale = 1;
  for (let sampleIndex = 1; sampleIndex <= TEST_TUBE_ARM_PATH_SAMPLES; sampleIndex++) {
    const ratio = sampleIndex / TEST_TUBE_ARM_PATH_SAMPLES;
    const z = rootPoint.z * (1 - ratio) + guideBottomZ * ratio;
    const innerContour = computeInnerContour(
      interpolatedOuterContour(params, z),
      params.wallThicknessMm,
    );
    const wallRadius = findRayContourRadius(innerContour, angle);
    if (wallRadius === null) {
      return null;
    }

    const halfWidth =
      (TEST_TUBE_ARM_START_WIDTH_MM * (1 - ratio) + TEST_TUBE_ARM_END_WIDTH_MM * ratio) / 2;
    const availableCornerRadius = wallRadius - TEST_TUBE_SUPPORT_WALL_MARGIN_MM;
    const allowedRadius = Math.sqrt(
      Math.max(0, availableCornerRadius * availableCornerRadius - halfWidth * halfWidth),
    );
    const availableSpan = allowedRadius - endRadius;
    if (availableSpan < -Number.EPSILON) {
      return null;
    }
    if (ratio < 1) {
      spanScale = Math.min(spanScale, Math.max(0, availableSpan) / (span * (1 - ratio)));
    }
  }

  const path: TestTubeSupportPoint[] = [];

  for (let sampleIndex = 1; sampleIndex <= TEST_TUBE_ARM_PATH_SAMPLES; sampleIndex++) {
    const ratio = sampleIndex / TEST_TUBE_ARM_PATH_SAMPLES;
    const z = rootPoint.z * (1 - ratio) + guideBottomZ * ratio;
    const radius = endRadius + span * spanScale * (1 - ratio);

    path.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z,
    });
  }

  return path;
}

function addFlaredTestTubeArm(
  verts: number[],
  faces: number[],
  path: readonly TestTubeSupportPoint[],
  angle: number,
  startArc: readonly TestTubeSupportPoint[],
  endArc: readonly TestTubeSupportPoint[],
) {
  if (path.length < 2 || startArc.length < 2 || endArc.length < 2) {
    return;
  }

  const sectionStarts: number[] = [];
  const tangentX = -Math.sin(angle);
  const tangentY = Math.cos(angle);
  const sectionVertexCount = TEST_TUBE_ARM_SECTION_POINTS * 2;
  const sections: Array<
    | { kind: "path"; point: TestTubeSupportPoint; ratio: number }
    | { kind: "ring"; points: readonly TestTubeSupportPoint[]; ratio: number }
  > = [
    { kind: "ring", points: startArc, ratio: 0 },
    ...path.map((point, index) => ({
      kind: "path" as const,
      point,
      ratio: index / Math.max(1, path.length - 1),
    })),
    { kind: "ring", points: endArc, ratio: 1 },
  ];

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const ratio = section.ratio;
    const point =
      section.kind === "path"
        ? section.point
        : (section.points[Math.floor(section.points.length / 2)] ?? path[0]);
    const flareRatio = 1 - (1 - ratio) ** 2;
    const halfWidth =
      (TEST_TUBE_ARM_START_WIDTH_MM * (1 - flareRatio) + TEST_TUBE_ARM_END_WIDTH_MM * flareRatio) /
      2;
    const topZ = point.z - (section.kind === "ring" && ratio === 1 ? 0.05 : 0);
    const bottomZ = topZ - TEST_TUBE_ARM_THICKNESS_MM;
    const sectionStart = verts.length / 3;
    for (let pointIndex = 0; pointIndex < TEST_TUBE_ARM_SECTION_POINTS; pointIndex++) {
      const sectionRatio =
        TEST_TUBE_ARM_SECTION_POINTS <= 1 ? 0.5 : pointIndex / (TEST_TUBE_ARM_SECTION_POINTS - 1);
      const lateral = (sectionRatio * 2 - 1) * halfWidth;
      const sourcePoint =
        section.kind === "ring"
          ? (section.points[
              Math.min(
                section.points.length - 1,
                Math.round(sectionRatio * Math.max(0, section.points.length - 1)),
              )
            ] ?? point)
          : {
              x: point.x + tangentX * lateral,
              y: point.y + tangentY * lateral,
              z: point.z,
            };
      verts.push(sourcePoint.x, sourcePoint.y, bottomZ);
    }

    for (let pointIndex = 0; pointIndex < TEST_TUBE_ARM_SECTION_POINTS; pointIndex++) {
      const bottomVertexOffset = sectionStart + pointIndex;
      verts.push(verts[bottomVertexOffset * 3], verts[bottomVertexOffset * 3 + 1], topZ);
    }
    sectionStarts.push(sectionStart);
  }

  for (let sectionIndex = 0; sectionIndex < sectionStarts.length - 1; sectionIndex++) {
    const current = sectionStarts[sectionIndex];
    const next = sectionStarts[sectionIndex + 1];

    for (let pointIndex = 0; pointIndex < TEST_TUBE_ARM_SECTION_POINTS - 1; pointIndex++) {
      const currentA = current + pointIndex;
      const currentB = current + pointIndex + 1;
      const nextA = next + pointIndex;
      const nextB = next + pointIndex + 1;
      faces.push(currentA, currentB, nextA, currentB, nextB, nextA);
    }

    for (let pointIndex = 0; pointIndex < TEST_TUBE_ARM_SECTION_POINTS - 1; pointIndex++) {
      const currentA = current + TEST_TUBE_ARM_SECTION_POINTS + pointIndex;
      const currentB = current + TEST_TUBE_ARM_SECTION_POINTS + pointIndex + 1;
      const nextA = next + TEST_TUBE_ARM_SECTION_POINTS + pointIndex;
      const nextB = next + TEST_TUBE_ARM_SECTION_POINTS + pointIndex + 1;
      faces.push(currentA, nextA, currentB, currentB, nextA, nextB);
    }

    faces.push(
      current,
      next,
      current + TEST_TUBE_ARM_SECTION_POINTS,
      current + TEST_TUBE_ARM_SECTION_POINTS,
      next,
      next + TEST_TUBE_ARM_SECTION_POINTS,
    );

    const currentRight = current + TEST_TUBE_ARM_SECTION_POINTS - 1;
    const nextRight = next + TEST_TUBE_ARM_SECTION_POINTS - 1;
    faces.push(
      currentRight,
      currentRight + TEST_TUBE_ARM_SECTION_POINTS,
      nextRight,
      currentRight + TEST_TUBE_ARM_SECTION_POINTS,
      nextRight + TEST_TUBE_ARM_SECTION_POINTS,
      nextRight,
    );
  }

  const first = sectionStarts[0];
  const firstPathPoint = path[0];
  const firstCapAnchor = verts.length / 3;
  verts.push(firstPathPoint.x, firstPathPoint.y, firstPathPoint.z);
  const firstPolygon = [
    ...Array.from({ length: TEST_TUBE_ARM_SECTION_POINTS }, (_, index) => first + index),
    ...Array.from(
      { length: TEST_TUBE_ARM_SECTION_POINTS },
      (_, index) => first + sectionVertexCount - 1 - index,
    ),
  ];
  for (let index = 0; index < firstPolygon.length; index++) {
    faces.push(
      firstCapAnchor,
      firstPolygon[index],
      firstPolygon[(index + 1) % firstPolygon.length],
    );
  }

  const last = sectionStarts[sectionStarts.length - 1];
  for (let index = 0; index < TEST_TUBE_ARM_SECTION_POINTS - 1; index++) {
    faces.push(
      last + index,
      last + TEST_TUBE_ARM_SECTION_POINTS + index,
      last + index + 1,
      last + index + 1,
      last + TEST_TUBE_ARM_SECTION_POINTS + index,
      last + TEST_TUBE_ARM_SECTION_POINTS + index + 1,
    );
  }
}

function addRingContactPin(
  verts: number[],
  faces: number[],
  angle: number,
  ringPoint: TestTubeSupportPoint,
) {
  const tangentX = -Math.sin(angle);
  const tangentY = Math.cos(angle);
  const radialX = Math.cos(angle);
  const radialY = Math.sin(angle);
  const baseZ = ringPoint.z - 0.05;
  const apex = verts.length / 3;
  const baseCenter = apex + 1;
  const baseLeft = apex + 2;
  const baseRight = apex + 3;

  verts.push(ringPoint.x, ringPoint.y, ringPoint.z);
  verts.push(ringPoint.x, ringPoint.y, baseZ);
  verts.push(
    ringPoint.x - radialX * 0.35 + tangentX * 0.28,
    ringPoint.y - radialY * 0.35 + tangentY * 0.28,
    baseZ,
  );
  verts.push(
    ringPoint.x - radialX * 0.35 - tangentX * 0.28,
    ringPoint.y - radialY * 0.35 - tangentY * 0.28,
    baseZ,
  );

  faces.push(apex, baseLeft, baseCenter);
  faces.push(apex, baseCenter, baseRight);
  faces.push(apex, baseRight, baseLeft);
  faces.push(baseCenter, baseLeft, baseRight);
}

function buildRingArcPoints(
  verts: readonly number[],
  ringStart: number,
  segments: number,
  angle: number,
  arcSegments: number,
): TestTubeSupportPoint[] {
  const centerIndex = findNearestRingVertexByAngle(verts, ringStart, segments, angle) - ringStart;
  const halfSpan = Math.floor(arcSegments / 2);
  const points: TestTubeSupportPoint[] = [];

  for (let offset = -halfSpan; offset <= halfSpan; offset++) {
    const ringIndex = ringStart + ((centerIndex + offset + segments) % segments);
    const vertexOffset = ringIndex * 3;
    points.push({
      x: verts[vertexOffset],
      y: verts[vertexOffset + 1],
      z: verts[vertexOffset + 2],
    });
  }

  return points;
}

function findNearestRingVertexByAngle(
  verts: readonly number[],
  ringStart: number,
  segments: number,
  angle: number,
): number {
  let bestIndex = ringStart;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < segments; index++) {
    const vertexIndex = ringStart + index;
    const x = verts[vertexIndex * 3];
    const y = verts[vertexIndex * 3 + 1];
    const distance = Math.abs(
      Math.atan2(Math.sin(Math.atan2(y, x) - angle), Math.cos(Math.atan2(y, x) - angle)),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = vertexIndex;
    }
  }

  return bestIndex;
}

function findSupportRootLayerIndex(
  zValues: readonly number[],
  targetZ: number,
  fallbackZ: number,
): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < zValues.length; index++) {
    const z = zValues[index];
    if (z > targetZ + Number.EPSILON) {
      continue;
    }

    const distance = Math.abs(z - targetZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  if (bestDistance < Number.POSITIVE_INFINITY) {
    return bestIndex;
  }

  for (let index = 0; index < zValues.length; index++) {
    const distance = Math.abs(zValues[index] - fallbackZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function addTestTubeThreeArmSupport(
  params: VaseParameters,
  verts: number[],
  faces: number[],
  config: TestTubeSupportConfig,
  innerRingStarts: readonly number[],
  zInner: readonly number[],
  zInnerBottom: number,
) {
  const guideInnerContour = computeInnerContour(
    interpolatedOuterContour(params, config.guideBottomZ),
    params.wallThicknessMm,
  );
  const guideWallRadius = distanceFromOriginToContourEdges(guideInnerContour);
  const radialSpan = Math.max(0, guideWallRadius - TEST_TUBE_GUIDE_OUTER_RADIUS_MM);
  const drop = Math.max(
    TEST_TUBE_ARM_MIN_DROP_MM,
    Math.min(TEST_TUBE_ARM_MAX_DROP_MM, radialSpan * TEST_TUBE_ARM_PRINTABLE_SLOPE_RATIO),
  );
  const rootLayerIndex = findSupportRootLayerIndex(
    zInner,
    config.guideBottomZ - drop,
    Math.max(zInnerBottom, config.guideBottomZ - TEST_TUBE_ARM_MIN_DROP_MM),
  );
  const rootRingStart = innerRingStarts[rootLayerIndex];
  const rootZ = zInner[rootLayerIndex] ?? zInnerBottom;

  const armPaths: TestTubeSupportPoint[][] = [];
  const armRootArcs: TestTubeSupportPoint[][] = [];
  for (let index = 0; index < TEST_TUBE_ARM_COUNT; index++) {
    const angle = (index / TEST_TUBE_ARM_COUNT) * Math.PI * 2;
    const rootIndex = findNearestRingVertexByAngle(
      verts,
      rootRingStart,
      params.radialSamples,
      angle,
    );
    const rootOffset = rootIndex * 3;
    const path = buildTestTubeSupportArmPath(
      params,
      {
        x: verts[rootOffset],
        y: verts[rootOffset + 1],
        z: rootZ,
      },
      angle,
      config.guideBottomZ,
    );
    if (!path) {
      return;
    }

    armPaths.push(path);
    armRootArcs.push(
      buildRingArcPoints(
        verts,
        rootRingStart,
        params.radialSamples,
        angle,
        TEST_TUBE_ARM_WALL_ARC_SEGMENTS,
      ),
    );
  }

  const ringStarts = addClosedRing(
    verts,
    faces,
    TEST_TUBE_GUIDE_INNER_RADIUS_MM,
    TEST_TUBE_GUIDE_OUTER_RADIUS_MM,
    config.guideBottomZ,
    config.guideTopZ,
    TEST_TUBE_RING_SEGMENTS,
    false,
  );
  if (!ringStarts) {
    return;
  }
  addRingUnderSupport(verts, faces, ringStarts, TEST_TUBE_RING_SEGMENTS, config.guideBottomZ);

  for (let index = 0; index < armPaths.length; index++) {
    const angle = (index / TEST_TUBE_ARM_COUNT) * Math.PI * 2;
    const path = armPaths[index];
    const ringArc = buildRingArcPoints(
      verts,
      ringStarts.outerBottomStart,
      TEST_TUBE_RING_SEGMENTS,
      angle,
      TEST_TUBE_ARM_RING_ARC_SEGMENTS,
    );
    addFlaredTestTubeArm(verts, faces, path, angle, armRootArcs[index], ringArc);
    const ringPoint = ringArc[Math.floor(ringArc.length / 2)];
    if (ringPoint) {
      addRingContactPin(verts, faces, angle, ringPoint);
    }
  }
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
  innerRingStarts: readonly number[],
  zInner: readonly number[],
  zInnerBottom: number,
  options: GenerateVaseMeshOptions,
) {
  const supportConfig =
    options.includeTestTubeSupport === false
      ? null
      : buildTestTubeSupportConfig(params, zInnerBottom);
  if (!supportConfig) {
    addFlatInnerBottomCap(verts, faces, innerBottomStart, params.radialSamples, zInnerBottom);
    return;
  }

  addFlatInnerBottomCap(verts, faces, innerBottomStart, params.radialSamples, zInnerBottom);
  addTestTubeThreeArmSupport(
    params,
    verts,
    faces,
    supportConfig,
    innerRingStarts,
    zInner,
    zInnerBottom,
  );
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
      innerRingStarts,
      zInner,
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
    const engravedMesh = await engraveBaseText(
      mesh,
      params,
      outerContours[0],
      seed,
      isSeedModified,
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
