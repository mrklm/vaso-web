import { ShapeUtils, Vector2 } from "three";
import { appendPipelineTrace } from "./pipeline-trace";
import type { MeshData } from "./types";
import { sanitizePlanarContour } from "./engraving-planar";

const DEFAULT_WELD_TOLERANCE_MM = 1e-4;
const DEFAULT_DEGENERATE_AREA_EPSILON_MM2 = 1e-8;
const MIN_PLANAR_HOLE_AREA_MM2 = 2;
const MAX_MICRO_HOLE_SPAN_MM = 2.5;

function quantize(value: number, tolerance: number): number {
  return Math.round(value / tolerance);
}

function canonicalizeVertices(mesh: MeshData, tolerance: number): {
  canonicalVertexByOriginal: Uint32Array;
  canonicalPositions: number[];
} {
  const canonicalVertexByOriginal = new Uint32Array(mesh.vertices.length / 3);
  const canonicalPositions: number[] = [];
  const vertexMap = new Map<string, number>();

  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const x = mesh.vertices[i];
    const y = mesh.vertices[i + 1];
    const z = mesh.vertices[i + 2];
    const key = `${quantize(x, tolerance)}:${quantize(y, tolerance)}:${quantize(z, tolerance)}`;

    let canonicalIndex = vertexMap.get(key);
    if (canonicalIndex === undefined) {
      canonicalIndex = canonicalPositions.length / 3;
      vertexMap.set(key, canonicalIndex);
      canonicalPositions.push(x, y, z);
    }

    canonicalVertexByOriginal[i / 3] = canonicalIndex;
  }

  return { canonicalVertexByOriginal, canonicalPositions };
}

function pointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function planarDistanceSquared(
  a: number,
  b: number,
  canonicalPositions: number[],
): number {
  const dx = canonicalPositions[a * 3] - canonicalPositions[b * 3];
  const dy = canonicalPositions[a * 3 + 1] - canonicalPositions[b * 3 + 1];
  return dx * dx + dy * dy;
}

function isColinearLoopIntermediateVertex(
  previous: number,
  current: number,
  next: number,
  canonicalPositions: number[],
  tolerance: number,
): boolean {
  const px = canonicalPositions[previous * 3];
  const py = canonicalPositions[previous * 3 + 1];
  const cx = canonicalPositions[current * 3];
  const cy = canonicalPositions[current * 3 + 1];
  const nx = canonicalPositions[next * 3];
  const ny = canonicalPositions[next * 3 + 1];
  const chordX = nx - px;
  const chordY = ny - py;
  const chordLength = Math.hypot(chordX, chordY);
  if (chordLength <= tolerance) return true;

  const area2 = Math.abs((cx - px) * chordY - (cy - py) * chordX);
  const distanceFromChord = area2 / chordLength;
  if (distanceFromChord > Math.max(tolerance * 8, 1e-2)) return false;

  const dot = (px - cx) * (nx - cx) + (py - cy) * (ny - cy);
  return dot <= tolerance * tolerance;
}

function sanitizePlanarLoop(
  loop: number[],
  canonicalPositions: number[],
  tolerance: number,
): number[] {
  if (loop.length < 3) return loop;

  const squaredTolerance = tolerance * tolerance;
  const deduplicated: number[] = [];
  for (const vertex of loop) {
    const previous = deduplicated[deduplicated.length - 1];
    if (
      previous === undefined ||
      planarDistanceSquared(previous, vertex, canonicalPositions) > squaredTolerance
    ) {
      deduplicated.push(vertex);
    }
  }

  if (
    deduplicated.length >= 2 &&
    planarDistanceSquared(deduplicated[0], deduplicated[deduplicated.length - 1], canonicalPositions) <=
      squaredTolerance
  ) {
    deduplicated.pop();
  }

  if (deduplicated.length < 3) return deduplicated;
  if (deduplicated.length >= 24) return deduplicated;

  let changed = true;
  while (changed && deduplicated.length >= 3) {
    changed = false;

    for (let index = 0; index < deduplicated.length; index++) {
      const previous = deduplicated[(index + deduplicated.length - 1) % deduplicated.length];
      const current = deduplicated[index];
      const next = deduplicated[(index + 1) % deduplicated.length];
      if (!isColinearLoopIntermediateVertex(previous, current, next, canonicalPositions, tolerance)) {
        continue;
      }

      deduplicated.splice(index, 1);
      changed = true;
      break;
    }
  }

  return deduplicated;
}

function isConvexContour(contour: Vector2[], tolerance: number): boolean {
  if (contour.length < 3) return false;

  let sign = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const c = contour[(i + 2) % contour.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx;
    if (Math.abs(cross) <= tolerance) continue;
    const nextSign = cross > 0 ? 1 : -1;
    if (sign === 0) sign = nextSign;
    else if (sign !== nextSign) return false;
  }

  return sign !== 0;
}

function isMicroPlanarHole(contour: Vector2[], signedArea: number): boolean {
  const area = Math.abs(signedArea);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of contour) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  return area < MIN_PLANAR_HOLE_AREA_MM2 || (width <= MAX_MICRO_HOLE_SPAN_MM && height <= MAX_MICRO_HOLE_SPAN_MM);
}

function contourCentroid(contour: Vector2[]): Vector2 | null {
  if (contour.length === 0) return null;

  let x = 0;
  let y = 0;
  for (const point of contour) {
    x += point.x;
    y += point.y;
  }

  return new Vector2(x / contour.length, y / contour.length);
}

function orientContour(contour: Vector2[], clockwise: boolean): Vector2[] {
  const area = ShapeUtils.area(contour);
  if ((clockwise && area > 0) || (!clockwise && area < 0)) {
    return [...contour].reverse();
  }
  return contour;
}

function orientLoopVertices(loop: number[], contour: Vector2[], clockwise: boolean): number[] {
  const area = ShapeUtils.area(contour);
  if ((clockwise && area > 0) || (!clockwise && area < 0)) {
    return [...loop].reverse();
  }
  return loop;
}

function triangleSignature(
  vertices: Float32Array,
  indices: Uint32Array,
  triangleIndex: number,
  tolerance: number,
): string | null {
  const signatureVertices: string[] = [];

  for (let offset = 0; offset < 3; offset++) {
    const vertexIndex = indices[triangleIndex * 3 + offset];
    const x = vertices[vertexIndex * 3];
    const y = vertices[vertexIndex * 3 + 1];
    const z = vertices[vertexIndex * 3 + 2];
    signatureVertices.push(
      `${quantize(x, tolerance)}:${quantize(y, tolerance)}:${quantize(z, tolerance)}`,
    );
  }

  signatureVertices.sort();
  if (
    signatureVertices[0] === signatureVertices[1] ||
    signatureVertices[1] === signatureVertices[2]
  ) {
    return null;
  }

  return signatureVertices.join("|");
}

export function removeTrianglesOnPlaneMatchingBase(
  mesh: MeshData,
  baseMesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): MeshData {
  const basePlaneTriangles = new Set<string>();

  for (let tri = 0; tri < baseMesh.indices.length; tri += 3) {
    const a = baseMesh.indices[tri];
    const b = baseMesh.indices[tri + 1];
    const c = baseMesh.indices[tri + 2];
    const az = baseMesh.vertices[a * 3 + 2];
    const bz = baseMesh.vertices[b * 3 + 2];
    const cz = baseMesh.vertices[c * 3 + 2];
    const onPlane =
      Math.abs(az - zValue) <= tolerance &&
      Math.abs(bz - zValue) <= tolerance &&
      Math.abs(cz - zValue) <= tolerance;
    if (!onPlane) continue;

    const signature = triangleSignature(baseMesh.vertices, baseMesh.indices, tri / 3, tolerance);
    if (signature) basePlaneTriangles.add(signature);
  }

  const nextIndices: number[] = [];
  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const a = mesh.indices[tri];
    const b = mesh.indices[tri + 1];
    const c = mesh.indices[tri + 2];
    const az = mesh.vertices[a * 3 + 2];
    const bz = mesh.vertices[b * 3 + 2];
    const cz = mesh.vertices[c * 3 + 2];
    const onPlane =
      Math.abs(az - zValue) <= tolerance &&
      Math.abs(bz - zValue) <= tolerance &&
      Math.abs(cz - zValue) <= tolerance;

    if (onPlane) {
      const signature = triangleSignature(mesh.vertices, mesh.indices, tri / 3, tolerance);
      if (signature && basePlaneTriangles.has(signature)) continue;
    }

    nextIndices.push(a, b, c);
  }

  if (nextIndices.length === mesh.indices.length) return mesh;
  return {
    vertices: mesh.vertices,
    indices: new Uint32Array(nextIndices),
  };
}

export interface MeshDiagnostics {
  vertexCount: number;
  triangleCount: number;
  components: number;
  nonManifoldEdges: number;
  boundaryEdges: number;
  boundaryLoops: number;
  watertight: boolean;
}

export interface PlanarBoundaryComponentDiagnostics {
  vertexCount: number;
  maxDegree: number;
  closed: boolean;
  simple: boolean;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  triangleCount: number;
}

export interface MeshDifferenceDiagnostics {
  sameVertexCount: boolean;
  sameTriangleCount: boolean;
  identical: boolean;
  sharedTriangles: number;
  removedTriangles: number;
  addedTriangles: number;
  sharedTriangleRatio: number;
}

export interface EdgeConnectedComponentDiagnostics {
  triangleCount: number;
  vertexCount: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ExtractedPlanarBoundaryLoop {
  loop: number[];
  contour: Vector2[];
  area: number;
}

interface PlanarLoopMetrics {
  area: number;
  width: number;
  height: number;
  perimeter: number;
  vertexCount: number;
}

interface PatchEdgeDiagnostics {
  sharedInternalEdges: number;
  exposedInternalEdges: number;
  contourEdges: number;
}

interface PatchMeshDiagnostics {
  triangleCount: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
}

interface RemovedTriangleDiagnostics {
  triangleIndex: number;
  reason: "duplicate-vertex" | "degenerate-area";
  areaSquared: number;
  bbox: string;
  indices: string;
  vertices: string;
}

interface PatchTriangleCleanupDiagnostics {
  keptIndices: number[];
  removedTriangles: RemovedTriangleDiagnostics[];
}

type IndexedTriangle = [number, number, number];

interface PatchRemovedTriangleDiagnostics {
  triangleIndex: number;
  sector: string;
  contourColinear: boolean;
}

interface PatchTriangulationDiagnostics {
  flippedEdges: number;
  contourColinearVertices: number;
  repairedDegenerateTriangles: number;
}

function getPlanarLoopMetrics(contour: Vector2[]): PlanarLoopMetrics {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let perimeter = 0;

  for (let i = 0; i < contour.length; i++) {
    const point = contour[i];
    const next = contour[(i + 1) % contour.length];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    perimeter += point.distanceTo(next);
  }

  return {
    area: Math.abs(ShapeUtils.area(contour)),
    width: maxX - minX,
    height: maxY - minY,
    perimeter,
    vertexCount: contour.length,
  };
}

function isDegeneratePlanarContour(contour: Vector2[], tolerance: number): boolean {
  if (contour.length < 3) return true;
  return Math.abs(ShapeUtils.area(contour)) <= Math.max(tolerance * tolerance, DEFAULT_DEGENERATE_AREA_EPSILON_MM2);
}

function isPathologicalPlanarHole(
  contour: Vector2[],
  tolerance: number,
): { reject: boolean; reason: string; metrics: PlanarLoopMetrics; simplifiedVertexCount: number } {
  const metrics = getPlanarLoopMetrics(contour);
  const simplifiedContour = sanitizePlanarContour(contour, Math.max(tolerance * 20, 0.05));
  const simplifiedVertexCount = simplifiedContour.length;
  const highlyDenseForTinyArea =
    metrics.vertexCount >= 128 &&
    metrics.area <= 2 &&
    Math.max(metrics.width, metrics.height) <= 3;
  const collapsedNoiseRing =
    metrics.vertexCount >= 96 &&
    simplifiedVertexCount <= 32 &&
    metrics.area <= 2.5;
  const extremeVertexDensity =
    metrics.area > 0 &&
    metrics.vertexCount / metrics.area >= 120 &&
    Math.max(metrics.width, metrics.height) <= 3;

  if (highlyDenseForTinyArea) {
    return { reject: true, reason: "tiny-dense-hole", metrics, simplifiedVertexCount };
  }
  if (collapsedNoiseRing) {
    return { reject: true, reason: "collapsed-noise-hole", metrics, simplifiedVertexCount };
  }
  if (extremeVertexDensity) {
    return { reject: true, reason: "extreme-vertex-density", metrics, simplifiedVertexCount };
  }

  return { reject: false, reason: "ok", metrics, simplifiedVertexCount };
}

function getPatchEdgeDiagnostics(
  triangles: number[][],
  outerVertexCount: number,
  holeVertexCounts: number[],
): PatchEdgeDiagnostics {
  const edgeUseCount = new Map<string, number>();
  const contourEdges = buildContourEdgeSet(outerVertexCount, holeVertexCounts);

  for (const [ia, ib, ic] of triangles) {
    const edges = [
      ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`,
      ib < ic ? `${ib}:${ic}` : `${ic}:${ib}`,
      ic < ia ? `${ic}:${ia}` : `${ia}:${ic}`,
    ];

    for (const edge of edges) {
      edgeUseCount.set(edge, (edgeUseCount.get(edge) ?? 0) + 1);
    }
  }

  let sharedInternalEdges = 0;
  let exposedInternalEdges = 0;
  for (const [edge, count] of edgeUseCount) {
    if (contourEdges.has(edge)) continue;
    if (count >= 2) sharedInternalEdges++;
    else exposedInternalEdges++;
  }

  return {
    sharedInternalEdges,
    exposedInternalEdges,
    contourEdges: contourEdges.size,
  };
}

function buildContourEdgeSet(
  outerVertexCount: number,
  holeVertexCounts: number[],
): Set<string> {
  const contourEdges = new Set<string>();
  const rings = [outerVertexCount, ...holeVertexCounts];
  let offset = 0;

  for (const ringVertexCount of rings) {
    for (let index = 0; index < ringVertexCount; index++) {
      contourEdges.add(edgeKey(offset + index, offset + ((index + 1) % ringVertexCount)));
    }
    offset += ringVertexCount;
  }

  return contourEdges;
}

function getRawIndexedMeshDiagnostics(
  vertexCount: number,
  indices: number[],
): PatchMeshDiagnostics {
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < indices.length; tri += 3) {
    const a = indices[tri];
    const b = indices[tri + 1];
    const c = indices[tri + 2];
    if (
      a < 0 || b < 0 || c < 0 ||
      a >= vertexCount || b >= vertexCount || c >= vertexCount ||
      a === b || b === c || a === c
    ) {
      continue;
    }

    const edges = [
      a < b ? `${a}:${b}` : `${b}:${a}`,
      b < c ? `${b}:${c}` : `${c}:${b}`,
      c < a ? `${c}:${a}` : `${a}:${c}`,
    ];
    for (const edge of edges) {
      edgeUseCount.set(edge, (edgeUseCount.get(edge) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeUseCount.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  return {
    triangleCount: indices.length / 3,
    boundaryEdges,
    nonManifoldEdges,
  };
}

function triangleSignedArea2D(points: Vector2[], a: number, b: number, c: number): number {
  const ax = points[a].x;
  const ay = points[a].y;
  const bx = points[b].x;
  const by = points[b].y;
  const cx = points[c].x;
  const cy = points[c].y;
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function triangleArea2D(points: Vector2[], a: number, b: number, c: number): number {
  return Math.abs(triangleSignedArea2D(points, a, b, c));
}

function edgeLengthSquared2D(points: Vector2[], a: number, b: number): number {
  const dx = points[b].x - points[a].x;
  const dy = points[b].y - points[a].y;
  return dx * dx + dy * dy;
}

function triangleQuality2D(points: Vector2[], a: number, b: number, c: number): number {
  const area2 = triangleArea2D(points, a, b, c);
  const maxEdgeSquared = Math.max(
    edgeLengthSquared2D(points, a, b),
    edgeLengthSquared2D(points, b, c),
    edgeLengthSquared2D(points, c, a),
  );
  return area2 / Math.max(maxEdgeSquared, Number.EPSILON);
}

function makeCounterClockwiseTriangle(
  points: Vector2[],
  a: number,
  b: number,
  c: number,
  areaEpsilon: number,
): IndexedTriangle | null {
  const signedArea = triangleSignedArea2D(points, a, b, c);
  if (Math.abs(signedArea) <= areaEpsilon) return null;
  return signedArea > 0 ? [a, b, c] : [a, c, b];
}

function getTriangleOppositeVertex(triangle: IndexedTriangle, edgeA: number, edgeB: number): number | null {
  for (const vertex of triangle) {
    if (vertex !== edgeA && vertex !== edgeB) return vertex;
  }
  return null;
}

function buildTriangleEdgeOwners(triangles: IndexedTriangle[]): Map<string, number[]> {
  const owners = new Map<string, number[]>();
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    const [a, b, c] = triangles[triangleIndex];
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      const existing = owners.get(key);
      if (existing) existing.push(triangleIndex);
      else owners.set(key, [triangleIndex]);
    }
  }
  return owners;
}

function countContourColinearVertices(points: Vector2[], ringVertexCounts: number[], tolerance: number): number {
  let offset = 0;
  let count = 0;
  const qualityEpsilon = Math.max(tolerance * 4, 1e-3);

  for (const ringVertexCount of ringVertexCounts) {
    for (let index = 0; index < ringVertexCount; index++) {
      const prev = offset + ((index + ringVertexCount - 1) % ringVertexCount);
      const current = offset + index;
      const next = offset + ((index + 1) % ringVertexCount);
      if (triangleQuality2D(points, prev, current, next) <= qualityEpsilon) count++;
    }
    offset += ringVertexCount;
  }

  return count;
}

function optimizePlanarPatchTriangulation(
  points: Vector2[],
  triangles: IndexedTriangle[],
  ringVertexCounts: number[],
  tolerance: number,
): { triangles: IndexedTriangle[]; diagnostics: PatchTriangulationDiagnostics } {
  const optimized = triangles.map(([a, b, c]) => [a, b, c] as IndexedTriangle);
  const contourEdges = buildContourEdgeSet(ringVertexCounts[0], ringVertexCounts.slice(1));
  const areaEpsilon = Math.sqrt(Math.max(tolerance * tolerance, DEFAULT_DEGENERATE_AREA_EPSILON_MM2));
  const qualityImprovementRatio = 1.05;
  const areaImprovementRatio = 1.1;
  let flippedEdges = 0;

  for (let pass = 0; pass < optimized.length * 2; pass++) {
    const edgeOwners = buildTriangleEdgeOwners(optimized);
    let changed = false;

    for (const [edge, owners] of edgeOwners.entries()) {
      if (owners.length !== 2 || contourEdges.has(edge)) continue;

      const [aText, bText] = edge.split(":");
      const edgeA = Number(aText);
      const edgeB = Number(bText);
      const triangleIndexA = owners[0];
      const triangleIndexB = owners[1];
      const triangleA = optimized[triangleIndexA];
      const triangleB = optimized[triangleIndexB];
      const oppositeA = getTriangleOppositeVertex(triangleA, edgeA, edgeB);
      const oppositeB = getTriangleOppositeVertex(triangleB, edgeA, edgeB);
      if (oppositeA === null || oppositeB === null || oppositeA === oppositeB) continue;

      const sideA = triangleSignedArea2D(points, edgeA, edgeB, oppositeA);
      const sideB = triangleSignedArea2D(points, edgeA, edgeB, oppositeB);
      if (Math.abs(sideA) <= areaEpsilon || Math.abs(sideB) <= areaEpsilon || sideA * sideB >= 0) continue;

      const flippedSideA = triangleSignedArea2D(points, oppositeA, oppositeB, edgeA);
      const flippedSideB = triangleSignedArea2D(points, oppositeA, oppositeB, edgeB);
      if (
        Math.abs(flippedSideA) <= areaEpsilon ||
        Math.abs(flippedSideB) <= areaEpsilon ||
        flippedSideA * flippedSideB >= 0
      ) {
        continue;
      }

      const nextTriangleA = makeCounterClockwiseTriangle(points, oppositeA, oppositeB, edgeA, areaEpsilon);
      const nextTriangleB = makeCounterClockwiseTriangle(points, oppositeB, oppositeA, edgeB, areaEpsilon);
      if (!nextTriangleA || !nextTriangleB) continue;

      const currentMinQuality = Math.min(
        triangleQuality2D(points, triangleA[0], triangleA[1], triangleA[2]),
        triangleQuality2D(points, triangleB[0], triangleB[1], triangleB[2]),
      );
      const currentMinArea = Math.min(
        triangleArea2D(points, triangleA[0], triangleA[1], triangleA[2]),
        triangleArea2D(points, triangleB[0], triangleB[1], triangleB[2]),
      );
      const nextMinQuality = Math.min(
        triangleQuality2D(points, nextTriangleA[0], nextTriangleA[1], nextTriangleA[2]),
        triangleQuality2D(points, nextTriangleB[0], nextTriangleB[1], nextTriangleB[2]),
      );
      const nextMinArea = Math.min(
        triangleArea2D(points, nextTriangleA[0], nextTriangleA[1], nextTriangleA[2]),
        triangleArea2D(points, nextTriangleB[0], nextTriangleB[1], nextTriangleB[2]),
      );

      const improvesQuality = nextMinQuality > currentMinQuality * qualityImprovementRatio;
      const improvesArea = nextMinArea > currentMinArea * areaImprovementRatio;
      if (!improvesQuality && !improvesArea) continue;

      optimized[triangleIndexA] = nextTriangleA;
      optimized[triangleIndexB] = nextTriangleB;
      flippedEdges++;
      changed = true;
      break;
    }

    if (!changed) break;
  }

  const repaired = repairPatchContourDegenerates(points, optimized, ringVertexCounts, tolerance);

  return {
    triangles: repaired.triangles,
    diagnostics: {
      flippedEdges,
      contourColinearVertices: countContourColinearVertices(points, ringVertexCounts, tolerance),
      repairedDegenerateTriangles: repaired.repairedTriangles,
    },
  };
}

function findContourChainTriangle(
  triangle: IndexedTriangle,
  ringVertexCounts: number[],
): { prev: number; middle: number; next: number } | null {
  let offset = 0;

  for (const ringVertexCount of ringVertexCounts) {
    const ringEnd = offset + ringVertexCount;
    const ringVertices = triangle.filter((vertex) => vertex >= offset && vertex < ringEnd);
    if (ringVertices.length !== 3) {
      offset = ringEnd;
      continue;
    }

    for (const middle of ringVertices) {
      const localIndex = middle - offset;
      const prev = offset + ((localIndex + ringVertexCount - 1) % ringVertexCount);
      const next = offset + ((localIndex + 1) % ringVertexCount);
      if (ringVertices.includes(prev) && ringVertices.includes(next)) {
        return { prev, middle, next };
      }
    }

    offset = ringEnd;
  }

  return null;
}

function repairPatchContourDegenerates(
  points: Vector2[],
  triangles: IndexedTriangle[],
  ringVertexCounts: number[],
  tolerance: number,
): { triangles: IndexedTriangle[]; repairedTriangles: number } {
  const repaired = triangles.map(([a, b, c]) => [a, b, c] as IndexedTriangle);
  const areaEpsilon = Math.sqrt(Math.max(tolerance * tolerance, DEFAULT_DEGENERATE_AREA_EPSILON_MM2));
  let repairedTriangles = 0;

  for (let pass = 0; pass < repaired.length; pass++) {
    const edgeOwners = buildTriangleEdgeOwners(repaired);
    let changed = false;

    for (let triangleIndex = 0; triangleIndex < repaired.length; triangleIndex++) {
      const triangle = repaired[triangleIndex];
      if (triangleArea2D(points, triangle[0], triangle[1], triangle[2]) > areaEpsilon) continue;

      const chain = findContourChainTriangle(triangle, ringVertexCounts);
      if (!chain) continue;

      const owners = edgeOwners.get(edgeKey(chain.prev, chain.next));
      if (!owners || owners.length !== 2) continue;

      const neighborIndex = owners[0] === triangleIndex ? owners[1] : owners[0];
      const neighbor = repaired[neighborIndex];
      const opposite = getTriangleOppositeVertex(neighbor, chain.prev, chain.next);
      if (opposite === null) continue;

      const replacementA = makeCounterClockwiseTriangle(points, opposite, chain.prev, chain.middle, areaEpsilon);
      const replacementB = makeCounterClockwiseTriangle(points, opposite, chain.middle, chain.next, areaEpsilon);
      if (!replacementA || !replacementB) continue;

      const currentMinArea = Math.min(
        triangleArea2D(points, triangle[0], triangle[1], triangle[2]),
        triangleArea2D(points, neighbor[0], neighbor[1], neighbor[2]),
      );
      const nextMinArea = Math.min(
        triangleArea2D(points, replacementA[0], replacementA[1], replacementA[2]),
        triangleArea2D(points, replacementB[0], replacementB[1], replacementB[2]),
      );
      if (nextMinArea <= currentMinArea) continue;

      repaired[triangleIndex] = replacementA;
      repaired[neighborIndex] = replacementB;
      repairedTriangles++;
      changed = true;
      break;
    }

    if (!changed) break;
  }

  return { triangles: repaired, repairedTriangles };
}

function analyzeIndexedTriangleCleanup(
  vertices: number[],
  indices: number[],
  areaEpsilon = DEFAULT_DEGENERATE_AREA_EPSILON_MM2,
): PatchTriangleCleanupDiagnostics {
  const keptIndices: number[] = [];
  const removedTriangles: RemovedTriangleDiagnostics[] = [];

  for (let tri = 0; tri < indices.length; tri += 3) {
    const triangleIndex = tri / 3;
    const a = indices[tri];
    const b = indices[tri + 1];
    const c = indices[tri + 2];

    if (a === b || b === c || a === c) {
      removedTriangles.push({
        triangleIndex,
        reason: "duplicate-vertex",
        areaSquared: 0,
        bbox: "n/a",
        indices: `${a},${b},${c}`,
        vertices: "n/a",
      });
      continue;
    }

    const ax = vertices[a * 3];
    const ay = vertices[a * 3 + 1];
    const az = vertices[a * 3 + 2];
    const bx = vertices[b * 3];
    const by = vertices[b * 3 + 1];
    const bz = vertices[b * 3 + 2];
    const cx = vertices[c * 3];
    const cy = vertices[c * 3 + 1];
    const cz = vertices[c * 3 + 2];

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const areaSquared = nx * nx + ny * ny + nz * nz;

    if (areaSquared <= areaEpsilon) {
      const minX = Math.min(ax, bx, cx);
      const minY = Math.min(ay, by, cy);
      const minZ = Math.min(az, bz, cz);
      const maxX = Math.max(ax, bx, cx);
      const maxY = Math.max(ay, by, cy);
      const maxZ = Math.max(az, bz, cz);
      removedTriangles.push({
        triangleIndex,
        reason: "degenerate-area",
        areaSquared,
        bbox: `${minX.toFixed(2)},${minY.toFixed(2)},${minZ.toFixed(2)}:${maxX.toFixed(2)},${maxY.toFixed(2)},${maxZ.toFixed(2)}`,
        indices: `${a},${b},${c}`,
        vertices: `(${ax.toFixed(2)},${ay.toFixed(2)},${az.toFixed(2)})/(${bx.toFixed(2)},${by.toFixed(2)},${bz.toFixed(2)})/(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)})`,
      });
      continue;
    }

    keptIndices.push(a, b, c);
  }

  return {
    keptIndices,
    removedTriangles,
  };
}

function classifyPatchSector(x: number, y: number, centerX: number, centerY: number): string {
  if (x >= centerX) return y >= centerY ? "NE" : "SE";
  return y >= centerY ? "NW" : "SW";
}

function analyzePatchRemovedTriangles(
  points: Vector2[],
  removedTriangles: RemovedTriangleDiagnostics[],
  ringVertexCounts: number[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  tolerance: number,
): PatchRemovedTriangleDiagnostics[] {
  const ringStarts: number[] = [];
  const ringByVertex: number[] = [];
  let offset = 0;

  for (let ringIndex = 0; ringIndex < ringVertexCounts.length; ringIndex++) {
    ringStarts.push(offset);
    for (let index = 0; index < ringVertexCounts[ringIndex]; index++) {
      ringByVertex[offset + index] = ringIndex;
    }
    offset += ringVertexCounts[ringIndex];
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const qualityEpsilon = Math.max(tolerance * 4, 1e-3);

  return removedTriangles.map((triangle) => {
    const vertices = triangle.indices.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
    let centroidX = 0;
    let centroidY = 0;
    for (const vertex of vertices) {
      centroidX += points[vertex]?.x ?? 0;
      centroidY += points[vertex]?.y ?? 0;
    }
    centroidX /= Math.max(vertices.length, 1);
    centroidY /= Math.max(vertices.length, 1);

    let contourColinear = false;
    for (const vertex of vertices) {
      const ringIndex = ringByVertex[vertex];
      if (ringIndex === undefined) continue;
      const ringStart = ringStarts[ringIndex];
      const ringVertexCount = ringVertexCounts[ringIndex];
      const localIndex = vertex - ringStart;
      const prev = ringStart + ((localIndex + ringVertexCount - 1) % ringVertexCount);
      const next = ringStart + ((localIndex + 1) % ringVertexCount);
      if (!vertices.includes(prev) || !vertices.includes(next)) continue;
      if (triangleQuality2D(points, prev, vertex, next) <= qualityEpsilon) {
        contourColinear = true;
        break;
      }
    }

    return {
      triangleIndex: triangle.triangleIndex,
      sector: classifyPatchSector(centroidX, centroidY, centerX, centerY),
      contourColinear,
    };
  });
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildEdgeOwners(indices: number[]): Map<string, number[]> {
  const owners = new Map<string, number[]>();
  for (let tri = 0; tri < indices.length; tri += 3) {
    const triangleIndex = tri / 3;
    const a = indices[tri];
    const b = indices[tri + 1];
    const c = indices[tri + 2];
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      const existing = owners.get(key);
      if (existing) existing.push(triangleIndex);
      else owners.set(key, [triangleIndex]);
    }
  }
  return owners;
}

function weldIndexedMesh(
  vertices: number[],
  indices: number[],
  tolerance: number,
): { vertices: number[]; indices: number[] } {
  const vertexMap = new Map<string, number>();
  const weldedVertices: number[] = [];
  const remappedVertex = new Int32Array(vertices.length / 3).fill(-1);

  for (let vertexIndex = 0; vertexIndex < vertices.length / 3; vertexIndex++) {
    const x = vertices[vertexIndex * 3];
    const y = vertices[vertexIndex * 3 + 1];
    const z = vertices[vertexIndex * 3 + 2];
    const key = `${quantize(x, tolerance)}:${quantize(y, tolerance)}:${quantize(z, tolerance)}`;
    let weldedIndex = vertexMap.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = weldedVertices.length / 3;
      vertexMap.set(key, weldedIndex);
      weldedVertices.push(x, y, z);
    }
    remappedVertex[vertexIndex] = weldedIndex;
  }

  const weldedIndices = indices.map((index) => remappedVertex[index]);
  return {
    vertices: weldedVertices,
    indices: weldedIndices,
  };
}

export function extractSimplePlanarBoundaryLoopsAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): ExtractedPlanarBoundaryLoop[] {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const key = edgeKey(a, b);
      edgeUseCount.set(key, (edgeUseCount.get(key) ?? 0) + 1);
    }
  }

  const boundaryNeighbors = new Map<number, number[]>();
  for (const [key, count] of edgeUseCount) {
    if (count !== 1) continue;
    const [aText, bText] = key.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) continue;
    boundaryNeighbors.set(a, [...(boundaryNeighbors.get(a) ?? []), b]);
    boundaryNeighbors.set(b, [...(boundaryNeighbors.get(b) ?? []), a]);
  }

  const visitedVertices = new Set<number>();
  const loops: ExtractedPlanarBoundaryLoop[] = [];

  for (const start of boundaryNeighbors.keys()) {
    if (visitedVertices.has(start)) continue;

    const component: number[] = [];
    const stack = [start];
    visitedVertices.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of boundaryNeighbors.get(current) ?? []) {
        if (!visitedVertices.has(next)) {
          visitedVertices.add(next);
          stack.push(next);
        }
      }
    }

    if (component.length < 3) continue;
    const componentSet = new Set(component);
    let validComponent = true;
    for (const vertex of component) {
      const degree = (boundaryNeighbors.get(vertex) ?? []).filter((next) => componentSet.has(next)).length;
      if (degree !== 2) {
        validComponent = false;
        break;
      }
    }
    if (!validComponent) continue;

    const loop: number[] = [];
    let previous = -1;
    let current = component[0];
    do {
      loop.push(current);
      const neighbors = (boundaryNeighbors.get(current) ?? []).filter((next) => componentSet.has(next));
      const next = neighbors[0] === previous ? neighbors[1] : neighbors[0];
      previous = current;
      current = next;
    } while (current !== component[0] && loop.length <= component.length + 1);

    if (current !== component[0] || loop.length < 3) continue;

    const sanitizedLoop = sanitizePlanarLoop(loop, canonicalPositions, tolerance);
    if (sanitizedLoop.length < 3) continue;
    const contour = sanitizedLoop.map(
      (vertex) => new Vector2(canonicalPositions[vertex * 3], canonicalPositions[vertex * 3 + 1]),
    );
    loops.push({
      loop: sanitizedLoop,
      contour,
      area: ShapeUtils.area(contour),
    });
  }

  return loops;
}

export function describeBoundaryEdgeAnomaliesAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
  patchTriangleStartIndex = Number.POSITIVE_INFINITY,
): string {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const edgeOwners = new Map<string, number[]>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangleIndex = tri / 3;
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;
      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      const owners = edgeOwners.get(edgeKey);
      if (owners) owners.push(triangleIndex);
      else edgeOwners.set(edgeKey, [triangleIndex]);
    }
  }

  const boundaryNeighbors = new Map<number, number[]>();
  const boundaryEdgeDetails = new Map<string, { a: number; b: number; owners: number[]; length: number }>();
  for (const [edgeKey, owners] of edgeOwners) {
    if (owners.length !== 1) continue;
    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) continue;

    const dx = canonicalPositions[a * 3] - canonicalPositions[b * 3];
    const dy = canonicalPositions[a * 3 + 1] - canonicalPositions[b * 3 + 1];
    const length = Math.hypot(dx, dy);
    boundaryNeighbors.set(a, [...(boundaryNeighbors.get(a) ?? []), b]);
    boundaryNeighbors.set(b, [...(boundaryNeighbors.get(b) ?? []), a]);
    boundaryEdgeDetails.set(edgeKey, { a, b, owners, length });
  }

  const anomalousVertices = [...boundaryNeighbors.entries()]
    .filter(([, neighbors]) => neighbors.length > 2)
    .map(([vertex, neighbors]) => {
      const ranked = [...neighbors]
        .map((neighbor) => {
          const key = vertex < neighbor ? `${vertex}:${neighbor}` : `${neighbor}:${vertex}`;
          return { neighbor, detail: boundaryEdgeDetails.get(key)! };
        })
        .sort((left, right) => left.detail.length - right.detail.length);
      const localNeighborSet = new Set(ranked.slice(0, 2).map((entry) => entry.neighbor));

      const px = canonicalPositions[vertex * 3];
      const py = canonicalPositions[vertex * 3 + 1];
      const neighborText = ranked.map(({ neighbor, detail }) => {
        const nx = canonicalPositions[neighbor * 3];
        const ny = canonicalPositions[neighbor * 3 + 1];
      const triangleIndex = detail.owners[0];
      const source = triangleIndex >= patchTriangleStartIndex ? "patch" : "mesh";
      const classification = localNeighborSet.has(neighbor) ? "local" : "long";
        return `(${nx.toFixed(2)},${ny.toFixed(2)}):${classification},len=${detail.length.toFixed(2)},owners=${detail.owners.length},tri=${triangleIndex},src=${source}`;
      }).join("/");

      return `(${px.toFixed(2)},${py.toFixed(2)}):d=${neighbors.length}->${neighborText}`;
    });

  return anomalousVertices.join(" || ") || "none";
}

export function removeAnomalousPatchBoundaryTrianglesAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
  patchTriangleStartIndex = Number.POSITIVE_INFINITY,
): MeshData {
  if (!Number.isFinite(patchTriangleStartIndex)) return mesh;

  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const edgeOwners = new Map<string, number[]>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangleIndex = tri / 3;
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;
      const key = edgeKey(a, b);
      const owners = edgeOwners.get(key);
      if (owners) owners.push(triangleIndex);
      else edgeOwners.set(key, [triangleIndex]);
    }
  }

  const boundaryNeighbors = new Map<number, number[]>();
  const boundaryEdgeDetails = new Map<string, { owners: number[]; length: number }>();
  for (const [edgeKey, owners] of edgeOwners) {
    if (owners.length !== 1) continue;
    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) continue;

    const dx = canonicalPositions[a * 3] - canonicalPositions[b * 3];
    const dy = canonicalPositions[a * 3 + 1] - canonicalPositions[b * 3 + 1];
    const length = Math.hypot(dx, dy);
    boundaryNeighbors.set(a, [...(boundaryNeighbors.get(a) ?? []), b]);
    boundaryNeighbors.set(b, [...(boundaryNeighbors.get(b) ?? []), a]);
    boundaryEdgeDetails.set(edgeKey, { owners, length });
  }

  const trianglesToRemove = new Set<number>();
  for (const [vertex, neighbors] of boundaryNeighbors.entries()) {
    if (neighbors.length <= 2) continue;

    const ranked = [...neighbors]
      .map((neighbor) => {
        const key = edgeKey(vertex, neighbor);
        return { neighbor, detail: boundaryEdgeDetails.get(key)! };
      })
      .sort((left, right) => left.detail.length - right.detail.length);
    const localNeighborSet = new Set(ranked.slice(0, 2).map((entry) => entry.neighbor));

    for (const { neighbor, detail } of ranked) {
      if (localNeighborSet.has(neighbor)) continue;
      const triangleIndex = detail.owners[0];
      if (triangleIndex < patchTriangleStartIndex) continue;
      trianglesToRemove.add(triangleIndex);
    }
  }

  if (trianglesToRemove.size === 0) return mesh;

  const nextIndices: number[] = [];
  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangleIndex = tri / 3;
    if (trianglesToRemove.has(triangleIndex)) continue;
    nextIndices.push(mesh.indices[tri], mesh.indices[tri + 1], mesh.indices[tri + 2]);
  }

  appendPipelineTrace(
    `[removeAnomalousPatchBoundaryTrianglesAtZ] removedTriangles=${trianglesToRemove.size}`,
  );

  return {
    vertices: mesh.vertices,
    indices: new Uint32Array(nextIndices),
  };
}

export function removeDegenerateTriangles(
  mesh: MeshData,
  areaEpsilon = DEFAULT_DEGENERATE_AREA_EPSILON_MM2,
): MeshData {
  const nextIndices: number[] = [];

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const a = mesh.indices[tri];
    const b = mesh.indices[tri + 1];
    const c = mesh.indices[tri + 2];
    if (a === b || b === c || a === c) continue;

    const ax = mesh.vertices[a * 3];
    const ay = mesh.vertices[a * 3 + 1];
    const az = mesh.vertices[a * 3 + 2];
    const bx = mesh.vertices[b * 3];
    const by = mesh.vertices[b * 3 + 1];
    const bz = mesh.vertices[b * 3 + 2];
    const cx = mesh.vertices[c * 3];
    const cy = mesh.vertices[c * 3 + 1];
    const cz = mesh.vertices[c * 3 + 2];

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const areaSquared = nx * nx + ny * ny + nz * nz;
    if (areaSquared <= areaEpsilon) continue;

    nextIndices.push(a, b, c);
  }

  if (nextIndices.length === mesh.indices.length) {
    return mesh;
  }

  return {
    vertices: mesh.vertices,
    indices: new Uint32Array(nextIndices),
  };
}

export function getMeshDifferenceDiagnostics(
  baseMesh: MeshData,
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): MeshDifferenceDiagnostics {
  const baseTriangleSignatures = new Set<string>();
  const meshTriangleSignatures = new Set<string>();

  for (let triangleIndex = 0; triangleIndex < baseMesh.indices.length / 3; triangleIndex++) {
    const signature = triangleSignature(baseMesh.vertices, baseMesh.indices, triangleIndex, tolerance);
    if (signature) baseTriangleSignatures.add(signature);
  }

  for (let triangleIndex = 0; triangleIndex < mesh.indices.length / 3; triangleIndex++) {
    const signature = triangleSignature(mesh.vertices, mesh.indices, triangleIndex, tolerance);
    if (signature) meshTriangleSignatures.add(signature);
  }

  let sharedTriangles = 0;
  for (const signature of meshTriangleSignatures) {
    if (baseTriangleSignatures.has(signature)) sharedTriangles++;
  }

  const removedTriangles = [...baseTriangleSignatures].filter((signature) => !meshTriangleSignatures.has(signature)).length;
  const addedTriangles = [...meshTriangleSignatures].filter((signature) => !baseTriangleSignatures.has(signature)).length;
  const sharedTriangleRatio =
    baseTriangleSignatures.size === 0 ? 1 : sharedTriangles / baseTriangleSignatures.size;

  return {
    sameVertexCount: baseMesh.vertices.length === mesh.vertices.length,
    sameTriangleCount: baseMesh.indices.length === mesh.indices.length,
    identical:
      baseTriangleSignatures.size === meshTriangleSignatures.size &&
      removedTriangles === 0 &&
      addedTriangles === 0,
    sharedTriangles,
    removedTriangles,
    addedTriangles,
    sharedTriangleRatio,
  };
}

export function sealPlanarBoundaryLoopAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
  options?: {
    preserveMicroHoles?: boolean;
  },
): MeshData {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const representativeVertexByCanonical = new Int32Array(canonicalPositions.length / 3).fill(-1);
  for (let index = 0; index < canonicalVertexByOriginal.length; index++) {
    const canonicalVertex = canonicalVertexByOriginal[index];
    if (representativeVertexByCanonical[canonicalVertex] === -1) {
      representativeVertexByCanonical[canonicalVertex] = index;
    }
  }
  const edgeUseCount = new Map<string, number>();
  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  const boundaryNeighbors = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeUseCount) {
    if (count !== 1) continue;

    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) {
      continue;
    }
    boundaryNeighbors.set(a, [...(boundaryNeighbors.get(a) ?? []), b]);
    boundaryNeighbors.set(b, [...(boundaryNeighbors.get(b) ?? []), a]);
  }

  if (boundaryNeighbors.size < 3) return mesh;
  const visitedVertices = new Set<number>();
  const loops: number[][] = [];
  const nextVertices = Array.from(mesh.vertices);
  const nextIndices = Array.from(mesh.indices);

  for (const start of boundaryNeighbors.keys()) {
    if (visitedVertices.has(start)) continue;

    const component: number[] = [];
    const stack = [start];
    visitedVertices.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of boundaryNeighbors.get(current) ?? []) {
        if (!visitedVertices.has(next)) {
          visitedVertices.add(next);
          stack.push(next);
        }
      }
    }

    if (component.length < 3) continue;
    const componentSet = new Set(component);
    let validComponent = true;
    for (const vertex of component) {
      const degree = (boundaryNeighbors.get(vertex) ?? []).filter((next) => componentSet.has(next)).length;
      if (degree !== 2) {
        validComponent = false;
        break;
      }
    }
    if (!validComponent) continue;

    const loop: number[] = [];
    let previous = -1;
    let current = component[0];

    do {
      loop.push(current);
      const neighbors = (boundaryNeighbors.get(current) ?? []).filter((next) => componentSet.has(next));
      const next = neighbors[0] === previous ? neighbors[1] : neighbors[0];
      previous = current;
      current = next;
    } while (current !== component[0] && loop.length <= component.length + 1);

    if (current === component[0] && loop.length >= 3) {
      loops.push(loop);
    }
  }

  const sanitizedLoops = loops
    .map((loop) => sanitizePlanarLoop(loop, canonicalPositions, tolerance))
    .filter((loop) => loop.length >= 3);

  if (sanitizedLoops.length === 0) return mesh;

  const viableLoops: number[][] = [];
  const viableSourceLoopLengths: number[] = [];
  const viableSanitizedLoopLengths: number[] = [];
  const contours: Vector2[][] = [];
  for (let loopIndex = 0; loopIndex < sanitizedLoops.length; loopIndex++) {
    const loop = sanitizedLoops[loopIndex];
    const contour = loop.map((vertex) => new Vector2(canonicalPositions[vertex * 3], canonicalPositions[vertex * 3 + 1]));
    const simplifiedContour = sanitizePlanarContour(contour, Math.max(tolerance * 4, 1e-3));
    const contourArea = Math.abs(ShapeUtils.area(contour));
    const collapsedToLine = simplifiedContour.length < 3;
    const simplifiedDegenerate = isDegeneratePlanarContour(simplifiedContour, tolerance);
    const effectivelyDegenerate =
      isDegeneratePlanarContour(contour, tolerance) ||
      ((collapsedToLine || simplifiedDegenerate) && contourArea <= MIN_PLANAR_HOLE_AREA_MM2);
    if (effectivelyDegenerate) {
      appendPipelineTrace(
        `[sealPlanarBoundaryLoopAtZ] skipped degenerate planar loop vertices=${loop.length},simplifiedVertices=${simplifiedContour.length},area=${contourArea.toExponential(2)}`,
      );
      continue;
    }
    viableLoops.push(loop);
    viableSourceLoopLengths.push(loops[loopIndex]?.length ?? loop.length);
    viableSanitizedLoopLengths.push(loop.length);
    contours.push(contour);
  }

  if (viableLoops.length === 0) return mesh;

  const loopsForSealing = viableLoops;
  const loopAreas = contours.map((contour) => ShapeUtils.area(contour));
  const absoluteLoopAreas = loopAreas.map((area) => Math.abs(area));
  const parentLoopIndices = new Int32Array(loopsForSealing.length).fill(-1);
  const loopDepths = new Int32Array(loopsForSealing.length);

  for (let childIndex = 0; childIndex < loopsForSealing.length; childIndex++) {
    const samplePoint = contourCentroid(contours[childIndex]);
    if (!samplePoint) continue;

    let parentIndex = -1;
    let parentArea = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < loopsForSealing.length; candidateIndex++) {
      if (candidateIndex === childIndex) continue;
      if (!pointInPolygon(samplePoint, contours[candidateIndex])) continue;
      if (absoluteLoopAreas[candidateIndex] >= parentArea) continue;
      parentIndex = candidateIndex;
      parentArea = absoluteLoopAreas[candidateIndex];
    }

    parentLoopIndices[childIndex] = parentIndex;
  }

  for (let loopIndex = 0; loopIndex < loopsForSealing.length; loopIndex++) {
    let depth = 0;
    let parentIndex = parentLoopIndices[loopIndex];
    while (parentIndex !== -1) {
      depth++;
      parentIndex = parentLoopIndices[parentIndex];
    }
    loopDepths[loopIndex] = depth;
  }
  const consumed = new Uint8Array(loopsForSealing.length);

  for (let outerIndex = 0; outerIndex < loopsForSealing.length; outerIndex++) {
    if (consumed[outerIndex]) continue;
    if (loopDepths[outerIndex] % 2 !== 0) continue;

    const outerLoop = orientLoopVertices(loopsForSealing[outerIndex], contours[outerIndex], false);
    const outerContour = orientContour(contours[outerIndex], false);
    const holeIndices: number[] = [];
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] outer sourceVertices=${viableSourceLoopLengths[outerIndex] ?? 0},outerSanitizedVertices=${viableSanitizedLoopLengths[outerIndex] ?? 0},outerUsedVertices=${outerLoop.length}`,
    );

    for (let i = 0; i < loopsForSealing.length; i++) {
      if (i === outerIndex || consumed[i]) continue;
      if (parentLoopIndices[i] !== outerIndex || loopDepths[i] !== loopDepths[outerIndex] + 1) continue;
      const pathologicalHole = isPathologicalPlanarHole(contours[i], tolerance);
      if (pathologicalHole.reject) {
        consumed[i] = 1;
        console.info(
          `[sealPlanarBoundaryLoopAtZ] rejected pathological hole reason=${pathologicalHole.reason} area=${pathologicalHole.metrics.area.toFixed(4)} bbox=${pathologicalHole.metrics.width.toFixed(2)}x${pathologicalHole.metrics.height.toFixed(2)} perimeter=${pathologicalHole.metrics.perimeter.toFixed(2)} vertices=${pathologicalHole.metrics.vertexCount} simplifiedVertices=${pathologicalHole.simplifiedVertexCount}`,
        );
        appendPipelineTrace(
          `[sealPlanarBoundaryLoopAtZ] rejected pathological hole reason=${pathologicalHole.reason},area=${pathologicalHole.metrics.area.toFixed(4)},bbox=${pathologicalHole.metrics.width.toFixed(2)}x${pathologicalHole.metrics.height.toFixed(2)},perimeter=${pathologicalHole.metrics.perimeter.toFixed(2)},vertices=${pathologicalHole.metrics.vertexCount},simplifiedVertices=${pathologicalHole.simplifiedVertexCount}`,
        );
        continue;
      }
      if (!options?.preserveMicroHoles && isMicroPlanarHole(contours[i], loopAreas[i])) {
        consumed[i] = 1;
        console.info(
          `[sealPlanarBoundaryLoopAtZ] filtered micro-hole area=${Math.abs(loopAreas[i]).toFixed(4)}`,
        );
        continue;
      }
      holeIndices.push(i);
      consumed[i] = 1;
      appendPipelineTrace(
        `[sealPlanarBoundaryLoopAtZ] hole sourceVertices=${viableSourceLoopLengths[i] ?? 0},holeSanitizedVertices=${loopsForSealing[i].length},holeArea=${Math.abs(loopAreas[i]).toFixed(4)}`,
      );
    }

    const holeContours = holeIndices.map((index) => orientContour(contours[index], true));
    const holeLoops = holeIndices.map((index) => orientLoopVertices(loopsForSealing[index], contours[index], true));
    if (holeContours.length === 0 && isConvexContour(outerContour, tolerance)) {
      let centerX = 0;
      let centerY = 0;
      let centerZ = 0;
      for (const vertex of outerLoop) {
        centerX += canonicalPositions[vertex * 3];
        centerY += canonicalPositions[vertex * 3 + 1];
        centerZ += canonicalPositions[vertex * 3 + 2];
      }
      centerX /= outerLoop.length;
      centerY /= outerLoop.length;
      centerZ /= outerLoop.length;

      const centerIndex = nextVertices.length / 3;
      nextVertices.push(centerX, centerY, centerZ);
      const area = ShapeUtils.area(outerContour);

      for (let index = 0; index < outerLoop.length; index++) {
        const current = representativeVertexByCanonical[outerLoop[index]];
        const next = representativeVertexByCanonical[outerLoop[(index + 1) % outerLoop.length]];
        if (current < 0 || next < 0 || current === next) continue;
        if (area >= 0) nextIndices.push(centerIndex, next, current);
        else nextIndices.push(centerIndex, current, next);
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const point of outerContour) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      console.info(
        `[sealPlanarBoundaryLoopAtZ] outer=${outerLoop.length} holes=0 fanTriangles=${outerLoop.length} bbox=${minX.toFixed(1)},${minY.toFixed(1)}:${maxX.toFixed(1)},${maxY.toFixed(1)}`,
      );
      appendPipelineTrace(
        `[sealPlanarBoundaryLoopAtZ] outer=${outerLoop.length},holes=0,fanTriangles=${outerLoop.length},patchVertices=1,bbox=${minX.toFixed(1)},${minY.toFixed(1)}:${maxX.toFixed(1)},${maxY.toFixed(1)}`,
      );
      consumed[outerIndex] = 1;
      continue;
    }

    const rawTriangles = ShapeUtils.triangulateShape(outerContour, holeContours);
    if (rawTriangles.length === 0) continue;
    const ringVertexCounts = [outerLoop.length, ...holeLoops.map((loop) => loop.length)];
    const { triangles, diagnostics: triangulationDiagnostics } = optimizePlanarPatchTriangulation(
      [outerContour, ...holeContours].flat(),
      rawTriangles.map(([a, b, c]) => [a, b, c] as IndexedTriangle),
      ringVertexCounts,
      tolerance,
    );
    const patchEdgeDiagnostics = getPatchEdgeDiagnostics(
      triangles,
      outerLoop.length,
      holeLoops.map((loop) => loop.length),
    );

    const baseIndex = nextVertices.length / 3;
    for (const vertex of outerLoop) {
      nextVertices.push(
        canonicalPositions[vertex * 3],
        canonicalPositions[vertex * 3 + 1],
        canonicalPositions[vertex * 3 + 2],
      );
    }
    for (let holeArrayIndex = 0; holeArrayIndex < holeIndices.length; holeArrayIndex++) {
      const holeLoop = holeLoops[holeArrayIndex];
      for (const vertex of holeLoop) {
        nextVertices.push(
          canonicalPositions[vertex * 3],
          canonicalPositions[vertex * 3 + 1],
          canonicalPositions[vertex * 3 + 2],
        );
      }
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of outerContour) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    console.info(
      `[sealPlanarBoundaryLoopAtZ] outer=${outerLoop.length} holes=${holeContours.length} triangles=${triangles.length} bbox=${minX.toFixed(1)},${minY.toFixed(1)}:${maxX.toFixed(1)},${maxY.toFixed(1)}`,
    );
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] outer=${outerLoop.length},holes=${holeContours.length},triangles=${triangles.length},patchVertices=${outerLoop.length + holeIndices.reduce((sum, holeIndex) => sum + loopsForSealing[holeIndex].length, 0)},patchContourEdges=${patchEdgeDiagnostics.contourEdges},patchSharedInternalEdges=${patchEdgeDiagnostics.sharedInternalEdges},patchExposedInternalEdges=${patchEdgeDiagnostics.exposedInternalEdges},patchFlippedInternalEdges=${triangulationDiagnostics.flippedEdges},patchContourColinearVertices=${triangulationDiagnostics.contourColinearVertices},patchRepairedDegenerateTriangles=${triangulationDiagnostics.repairedDegenerateTriangles},bbox=${minX.toFixed(1)},${minY.toFixed(1)}:${maxX.toFixed(1)},${maxY.toFixed(1)}`,
    );
    const area = ShapeUtils.area(outerContour);
    const patchVerticesForDiagnostics: number[] = [];
    for (const vertex of outerLoop) {
      patchVerticesForDiagnostics.push(
        canonicalPositions[vertex * 3],
        canonicalPositions[vertex * 3 + 1],
        canonicalPositions[vertex * 3 + 2],
      );
    }
    for (const holeLoop of holeLoops) {
      for (const vertex of holeLoop) {
        patchVerticesForDiagnostics.push(
          canonicalPositions[vertex * 3],
          canonicalPositions[vertex * 3 + 1],
          canonicalPositions[vertex * 3 + 2],
        );
      }
    }
    const patchIndicesForDiagnostics: number[] = [];

    for (const [ia, ib, ic] of triangles) {
      if (area >= 0) {
        nextIndices.push(baseIndex + ic, baseIndex + ib, baseIndex + ia);
        patchIndicesForDiagnostics.push(ic, ib, ia);
      } else {
        nextIndices.push(baseIndex + ia, baseIndex + ib, baseIndex + ic);
        patchIndicesForDiagnostics.push(ia, ib, ic);
      }
    }
    const rawPatchDiagnostics = getRawIndexedMeshDiagnostics(
      patchVerticesForDiagnostics.length / 3,
      patchIndicesForDiagnostics,
    );
    const patchCleanupAnalysis = analyzeIndexedTriangleCleanup(
      patchVerticesForDiagnostics,
      patchIndicesForDiagnostics,
    );
    const patchRemovedTriangleDiagnostics = analyzePatchRemovedTriangles(
      [outerContour, ...holeContours].flat(),
      patchCleanupAnalysis.removedTriangles,
      ringVertexCounts,
      minX,
      minY,
      maxX,
      maxY,
      tolerance,
    );
    const weldedPatchRaw = weldIndexedMesh(
      patchVerticesForDiagnostics,
      patchIndicesForDiagnostics,
      tolerance,
    );
    const weldedPatchCleanupAnalysis = analyzeIndexedTriangleCleanup(
      weldedPatchRaw.vertices,
      weldedPatchRaw.indices,
    );
    const cleanedPatch = {
      vertices: new Float32Array(patchVerticesForDiagnostics),
      indices: new Uint32Array(patchCleanupAnalysis.keptIndices),
    };
    const cleanedPatchDiagnostics = getMeshDiagnostics(cleanedPatch, tolerance);
    const patchContourEdges = buildContourEdgeSet(
      outerLoop.length,
      holeLoops.map((loop) => loop.length),
    );
    const rawPatchOwners = buildEdgeOwners(patchIndicesForDiagnostics);
    const cleanedPatchOwners = buildEdgeOwners(patchCleanupAnalysis.keptIndices);
    const suspiciousPatchEdges = [...rawPatchOwners.entries()]
      .filter(([edge, owners]) => {
        if (patchContourEdges.has(edge)) return false;
        if (owners.length < 2) return false;
        return (cleanedPatchOwners.get(edge)?.length ?? 0) === 1;
      })
      .slice(0, 8)
      .map(([edge, owners]) => {
        const cleanedOwners = cleanedPatchOwners.get(edge) ?? [];
        const [aText, bText] = edge.split(":");
        const a = Number(aText);
        const b = Number(bText);
        const ax = patchVerticesForDiagnostics[a * 3];
        const ay = patchVerticesForDiagnostics[a * 3 + 1];
        const bx = patchVerticesForDiagnostics[b * 3];
        const by = patchVerticesForDiagnostics[b * 3 + 1];
        const statuses = owners.map((triangleIndex) => {
          const removed = patchCleanupAnalysis.removedTriangles.find((triangle) => triangle.triangleIndex === triangleIndex);
          return removed
            ? `${triangleIndex}:removed:${removed.reason}:area2=${removed.areaSquared.toExponential(2)}`
            : `${triangleIndex}:kept`;
        }).join("/");
        return `(${ax.toFixed(2)},${ay.toFixed(2)})-(${bx.toFixed(2)},${by.toFixed(2)}):rawOwners=${owners.length},cleanedOwners=${cleanedOwners.length},triangles=${statuses}`;
      });
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] patch rawTriangles=${rawPatchDiagnostics.triangleCount},patchRawBoundaryEdges=${rawPatchDiagnostics.boundaryEdges},patchRawNonManifoldEdges=${rawPatchDiagnostics.nonManifoldEdges},patchInjectedTriangles=${patchIndicesForDiagnostics.length / 3},patchPreWeldCleanedTriangles=${cleanedPatchDiagnostics.triangleCount},patchPreWeldCleanedBoundaryEdges=${cleanedPatchDiagnostics.boundaryEdges},patchPreWeldCleanedNonManifoldEdges=${cleanedPatchDiagnostics.nonManifoldEdges},patchPostWeldCleanedTriangles=${weldedPatchCleanupAnalysis.keptIndices.length / 3},patchPostWeldRemovedTriangles=${weldedPatchCleanupAnalysis.removedTriangles.length}`,
    );
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] patch preWeldRemovedTriangles=${patchCleanupAnalysis.removedTriangles.length},removedSamples=${patchCleanupAnalysis.removedTriangles.slice(0, 8).map((triangle) => `#${triangle.triangleIndex}:${triangle.reason}:area2=${triangle.areaSquared.toExponential(2)}:bbox=${triangle.bbox}:idx=${triangle.indices}:verts=${triangle.vertices}`).join(" || ") || "none"}`,
    );
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] patch removedTriangleContourColinear=${patchRemovedTriangleDiagnostics.filter((triangle) => triangle.contourColinear).length}/${patchRemovedTriangleDiagnostics.length},removedTriangleSectors=${["NW", "NE", "SW", "SE"].map((sector) => `${sector}:${patchRemovedTriangleDiagnostics.filter((triangle) => triangle.sector === sector).length}`).join(",")}`,
    );
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] patch postWeldRemovedTriangles=${weldedPatchCleanupAnalysis.removedTriangles.length},removedSamples=${weldedPatchCleanupAnalysis.removedTriangles.slice(0, 8).map((triangle) => `#${triangle.triangleIndex}:${triangle.reason}:area2=${triangle.areaSquared.toExponential(2)}:bbox=${triangle.bbox}:idx=${triangle.indices}:verts=${triangle.vertices}`).join(" || ") || "none"}`,
    );
    appendPipelineTrace(
      `[sealPlanarBoundaryLoopAtZ] patch orphanedInternalEdges=${suspiciousPatchEdges.join(" || ") || "none"}`,
    );

    consumed[outerIndex] = 1;
  }

  for (let i = 0; i < loopsForSealing.length; i++) {
    if (consumed[i]) continue;
    if (loopDepths[i] % 2 !== 0 && isMicroPlanarHole(contours[i], loopAreas[i])) continue;

    const contour = orientContour(contours[i], loopDepths[i] % 2 !== 0);
    const triangles = ShapeUtils.triangulateShape(contour, []);
    if (triangles.length === 0) continue;

    const baseIndex = nextVertices.length / 3;
    for (const vertex of loopsForSealing[i]) {
      nextVertices.push(
        canonicalPositions[vertex * 3],
        canonicalPositions[vertex * 3 + 1],
        canonicalPositions[vertex * 3 + 2],
      );
    }

    for (const [ia, ib, ic] of triangles) {
      if (ShapeUtils.area(contour) >= 0) nextIndices.push(baseIndex + ic, baseIndex + ib, baseIndex + ia);
      else nextIndices.push(baseIndex + ia, baseIndex + ib, baseIndex + ic);
    }
  }

  return removeDegenerateTriangles({
    vertices: new Float32Array(nextVertices),
    indices: new Uint32Array(nextIndices),
  });
}

export function sealSimplePlanarBoundaryComponentsAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): MeshData {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const canonicalCount = canonicalPositions.length / 3;
  const representativeVertexByCanonical = new Int32Array(canonicalCount).fill(-1);

  for (let i = 0; i < canonicalVertexByOriginal.length; i++) {
    const canonical = canonicalVertexByOriginal[i];
    if (representativeVertexByCanonical[canonical] === -1) {
      representativeVertexByCanonical[canonical] = i;
    }
  }

  const edgeUseCount = new Map<string, number>();
  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  const boundaryNeighbors = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeUseCount) {
    if (count !== 1) continue;

    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) {
      continue;
    }
    boundaryNeighbors.set(a, [...(boundaryNeighbors.get(a) ?? []), b]);
    boundaryNeighbors.set(b, [...(boundaryNeighbors.get(b) ?? []), a]);
  }

  if (boundaryNeighbors.size < 3) return mesh;

  const visitedVertices = new Set<number>();
  const nextIndices = Array.from(mesh.indices);

  for (const start of boundaryNeighbors.keys()) {
    if (visitedVertices.has(start)) continue;

    const component: number[] = [];
    const stack = [start];
    visitedVertices.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of boundaryNeighbors.get(current) ?? []) {
        if (!visitedVertices.has(next)) {
          visitedVertices.add(next);
          stack.push(next);
        }
      }
    }

    if (component.length < 3) continue;
    const componentSet = new Set(component);
    let validComponent = true;
    for (const vertex of component) {
      const degree = (boundaryNeighbors.get(vertex) ?? []).filter((next) => componentSet.has(next)).length;
      if (degree !== 2) {
        validComponent = false;
        break;
      }
    }
    if (!validComponent) continue;

    const loop: number[] = [];
    let previous = -1;
    let current = component[0];

    do {
      loop.push(current);
      const neighbors = (boundaryNeighbors.get(current) ?? []).filter((next) => componentSet.has(next));
      const next = neighbors[0] === previous ? neighbors[1] : neighbors[0];
      previous = current;
      current = next;
    } while (current !== component[0] && loop.length <= component.length + 1);

    if (current !== component[0] || loop.length < 3) continue;

    const contour = loop.map((vertex) => new Vector2(canonicalPositions[vertex * 3], canonicalPositions[vertex * 3 + 1]));
    const triangles = ShapeUtils.triangulateShape(contour, []);
    for (const [ia, ib, ic] of triangles) {
      const aVertex = loop[ia];
      const bVertex = loop[ib];
      const cVertex = loop[ic];
      const a = representativeVertexByCanonical[aVertex];
      const b = representativeVertexByCanonical[bVertex];
      const c = representativeVertexByCanonical[cVertex];
      if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;

      if (ShapeUtils.area(contour) >= 0) {
        nextIndices.push(c, b, a);
      } else {
        nextIndices.push(a, b, c);
      }
    }
  }

  return removeDegenerateTriangles({
    vertices: mesh.vertices,
    indices: new Uint32Array(nextIndices),
  });
}

export function sealResidualPlanarBoundaryComponentsAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): MeshData {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const canonicalCount = canonicalPositions.length / 3;
  const representativeVertexByCanonical = new Int32Array(canonicalCount).fill(-1);

  for (let i = 0; i < canonicalVertexByOriginal.length; i++) {
    const canonical = canonicalVertexByOriginal[i];
    if (representativeVertexByCanonical[canonical] === -1) {
      representativeVertexByCanonical[canonical] = i;
    }
  }

  const edgeUseCount = new Map<string, number>();
  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;
      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  const neighbors = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeUseCount) {
    if (count !== 1) continue;

    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) continue;
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }

  const nextIndices = Array.from(mesh.indices);
  const visited = new Set<number>();

  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;

    const component: number[] = [];
    const stack = [start];
    visited.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }

    if (component.length < 3) continue;

    let centerX = 0;
    let centerY = 0;
    for (const vertex of component) {
      centerX += canonicalPositions[vertex * 3];
      centerY += canonicalPositions[vertex * 3 + 1];
    }
    centerX /= component.length;
    centerY /= component.length;

    const ordered = [...component].sort((a, b) => {
      const angleA = Math.atan2(
        canonicalPositions[a * 3 + 1] - centerY,
        canonicalPositions[a * 3] - centerX,
      );
      const angleB = Math.atan2(
        canonicalPositions[b * 3 + 1] - centerY,
        canonicalPositions[b * 3] - centerX,
      );
      return angleA - angleB;
    });

    const contour = ordered.map(
      (vertex) => new Vector2(canonicalPositions[vertex * 3], canonicalPositions[vertex * 3 + 1]),
    );
    const triangles = ShapeUtils.triangulateShape(contour, []);

    for (const [ia, ib, ic] of triangles) {
      const a = representativeVertexByCanonical[ordered[ia]];
      const b = representativeVertexByCanonical[ordered[ib]];
      const c = representativeVertexByCanonical[ordered[ic]];
      if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;

      if (ShapeUtils.area(contour) >= 0) {
        nextIndices.push(c, b, a);
      } else {
        nextIndices.push(a, b, c);
      }
    }
  }

  return removeDegenerateTriangles({
    vertices: mesh.vertices,
    indices: new Uint32Array(nextIndices),
  });
}

export function countConnectedMeshComponents(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): number {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const triangleCount = mesh.indices.length / 3;
  const trianglesByVertex = Array.from({ length: canonicalPositions.length / 3 }, () => [] as number[]);
  const validTriangle = new Uint8Array(triangleCount);
  const neighbors = Array.from({ length: triangleCount }, () => [] as number[]);

  for (let tri = 0; tri < triangleCount; tri++) {
    const a = canonicalVertexByOriginal[mesh.indices[tri * 3]];
    const b = canonicalVertexByOriginal[mesh.indices[tri * 3 + 1]];
    const c = canonicalVertexByOriginal[mesh.indices[tri * 3 + 2]];
    if (a === b || b === c || a === c) continue;

    validTriangle[tri] = 1;
    trianglesByVertex[a].push(tri);
    trianglesByVertex[b].push(tri);
    trianglesByVertex[c].push(tri);
  }

  for (const triangles of trianglesByVertex) {
    for (let i = 1; i < triangles.length; i++) {
      const prev = triangles[i - 1];
      const next = triangles[i];
      neighbors[prev].push(next);
      neighbors[next].push(prev);
    }
  }

  let componentCount = 0;
  const visited = new Uint8Array(triangleCount);
  const stack: number[] = [];

  for (let tri = 0; tri < triangleCount; tri++) {
    if (!validTriangle[tri] || visited[tri]) continue;
    componentCount++;
    visited[tri] = 1;
    stack.push(tri);

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of neighbors[current]) {
        if (!visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
  }

  return componentCount;
}

export function countEdgeConnectedMeshComponents(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): number {
  const { canonicalVertexByOriginal } = canonicalizeVertices(mesh, tolerance);
  const triangleCount = mesh.indices.length / 3;
  const validTriangle = new Uint8Array(triangleCount);
  const edgeOwners = new Map<string, number[]>();
  const neighbors = Array.from({ length: triangleCount }, () => [] as number[]);

  for (let tri = 0; tri < triangleCount; tri++) {
    const a = canonicalVertexByOriginal[mesh.indices[tri * 3]];
    const b = canonicalVertexByOriginal[mesh.indices[tri * 3 + 1]];
    const c = canonicalVertexByOriginal[mesh.indices[tri * 3 + 2]];
    if (a === b || b === c || a === c) continue;

    validTriangle[tri] = 1;
    const edges = [
      a < b ? `${a}:${b}` : `${b}:${a}`,
      b < c ? `${b}:${c}` : `${c}:${b}`,
      c < a ? `${c}:${a}` : `${a}:${c}`,
    ];

    for (const edge of edges) {
      const owners = edgeOwners.get(edge);
      if (owners) {
        owners.push(tri);
      } else {
        edgeOwners.set(edge, [tri]);
      }
    }
  }

  for (const owners of edgeOwners.values()) {
    if (owners.length !== 2) continue;
    const [a, b] = owners;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  let componentCount = 0;
  const visited = new Uint8Array(triangleCount);
  const stack: number[] = [];

  for (let tri = 0; tri < triangleCount; tri++) {
    if (!validTriangle[tri] || visited[tri]) continue;
    componentCount++;
    visited[tri] = 1;
    stack.push(tri);

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of neighbors[current]) {
        if (!visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
  }

  return componentCount;
}

export function describeEdgeConnectedMeshComponents(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): EdgeConnectedComponentDiagnostics[] {
  const { canonicalVertexByOriginal } = canonicalizeVertices(mesh, tolerance);
  const triangleCount = mesh.indices.length / 3;
  const validTriangle = new Uint8Array(triangleCount);
  const edgeOwners = new Map<string, number[]>();
  const neighbors = Array.from({ length: triangleCount }, () => [] as number[]);

  for (let tri = 0; tri < triangleCount; tri++) {
    const a = canonicalVertexByOriginal[mesh.indices[tri * 3]];
    const b = canonicalVertexByOriginal[mesh.indices[tri * 3 + 1]];
    const c = canonicalVertexByOriginal[mesh.indices[tri * 3 + 2]];
    if (a === b || b === c || a === c) continue;

    validTriangle[tri] = 1;
    const edges = [
      a < b ? `${a}:${b}` : `${b}:${a}`,
      b < c ? `${b}:${c}` : `${c}:${b}`,
      c < a ? `${c}:${a}` : `${a}:${c}`,
    ];

    for (const edge of edges) {
      const owners = edgeOwners.get(edge);
      if (owners) owners.push(tri);
      else edgeOwners.set(edge, [tri]);
    }
  }

  for (const owners of edgeOwners.values()) {
    if (owners.length !== 2) continue;
    const [a, b] = owners;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  const visited = new Uint8Array(triangleCount);
  const descriptions: EdgeConnectedComponentDiagnostics[] = [];

  for (let tri = 0; tri < triangleCount; tri++) {
    if (!validTriangle[tri] || visited[tri]) continue;

    const component: number[] = [];
    const stack = [tri];
    visited[tri] = 1;

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of neighbors[current]) {
        if (!visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    const vertices = new Set<number>();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const componentTriangle of component) {
      for (let offset = 0; offset < 3; offset++) {
        const vertexIndex = mesh.indices[componentTriangle * 3 + offset];
        vertices.add(vertexIndex);
        const x = mesh.vertices[vertexIndex * 3];
        const y = mesh.vertices[vertexIndex * 3 + 1];
        const z = mesh.vertices[vertexIndex * 3 + 2];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }

    descriptions.push({
      triangleCount: component.length,
      vertexCount: vertices.size,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
    });
  }

  return descriptions.sort((left, right) => right.triangleCount - left.triangleCount);
}

export function countBoundaryEdges(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): number {
  const { canonicalVertexByOriginal } = canonicalizeVertices(mesh, tolerance);
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  let boundaryEdgeCount = 0;
  for (const count of edgeUseCount.values()) {
    if (count === 1) boundaryEdgeCount++;
  }

  return boundaryEdgeCount;
}

export function countNonManifoldEdges(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): number {
  const { canonicalVertexByOriginal } = canonicalizeVertices(mesh, tolerance);
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  let nonManifoldEdgeCount = 0;
  for (const count of edgeUseCount.values()) {
    if (count > 2) nonManifoldEdgeCount++;
  }

  return nonManifoldEdgeCount;
}

export function countBoundaryLoopsAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): number {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  const neighbors = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeUseCount) {
    if (count !== 1) continue;

    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) {
      continue;
    }

    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }

  let loopCount = 0;
  const visited = new Set<number>();
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;

    loopCount++;
    const stack = [start];
    visited.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of neighbors.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
  }

  return loopCount;
}

export function describePlanarBoundaryComponentsAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): PlanarBoundaryComponentDiagnostics[] {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  const neighbors = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeUseCount) {
    if (count !== 1) continue;
    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) continue;
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }

  const diagnostics: PlanarBoundaryComponentDiagnostics[] = [];
  const visited = new Set<number>();

  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;

    const component: number[] = [];
    const stack = [start];
    visited.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }

    if (component.length < 3) continue;

    let maxDegree = 0;
    let simple = true;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const vertex of component) {
      const degree = (neighbors.get(vertex) ?? []).filter((next) => component.includes(next)).length;
      maxDegree = Math.max(maxDegree, degree);
      if (degree !== 2) simple = false;
      const x = canonicalPositions[vertex * 3];
      const y = canonicalPositions[vertex * 3 + 1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    let closed = false;
    let area = 0;
    let triangleCount = 0;

    if (simple) {
      const componentSet = new Set(component);
      const loop: number[] = [];
      let previous = -1;
      let current = component[0];

      do {
        loop.push(current);
        const candidates = (neighbors.get(current) ?? []).filter((next) => componentSet.has(next));
        const next = candidates[0] === previous ? candidates[1] : candidates[0];
        previous = current;
        current = next;
      } while (current !== component[0] && loop.length <= component.length + 1);

      closed = current === component[0] && loop.length >= 3;
      if (closed) {
        const contour = loop.map(
          (vertex) => new Vector2(canonicalPositions[vertex * 3], canonicalPositions[vertex * 3 + 1]),
        );
        area = ShapeUtils.area(contour);
        triangleCount = ShapeUtils.triangulateShape(contour, []).length;
      }
    }

    diagnostics.push({
      vertexCount: component.length,
      maxDegree,
      closed,
      simple,
      area,
      minX,
      minY,
      maxX,
      maxY,
      triangleCount,
    });
  }

  return diagnostics;
}

export function describeNonSimplePlanarBoundaryComponentsAtZ(
  mesh: MeshData,
  zValue: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): string {
  const { canonicalVertexByOriginal, canonicalPositions } = canonicalizeVertices(mesh, tolerance);
  const edgeUseCount = new Map<string, number>();

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    const triangle = [
      canonicalVertexByOriginal[mesh.indices[tri]],
      canonicalVertexByOriginal[mesh.indices[tri + 1]],
      canonicalVertexByOriginal[mesh.indices[tri + 2]],
    ];

    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      if (a === b) continue;

      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCount.set(edgeKey, (edgeUseCount.get(edgeKey) ?? 0) + 1);
    }
  }

  const neighbors = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeUseCount) {
    if (count !== 1) continue;

    const [aText, bText] = edgeKey.split(":");
    const a = Number(aText);
    const b = Number(bText);
    const az = canonicalPositions[a * 3 + 2];
    const bz = canonicalPositions[b * 3 + 2];
    if (Math.abs(az - zValue) > tolerance * 2 || Math.abs(bz - zValue) > tolerance * 2) continue;
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }

  const visited = new Set<number>();
  const descriptions: string[] = [];

  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;

    const component: number[] = [];
    const stack = [start];
    visited.add(start);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }

    const componentSet = new Set(component);
    const vertexDescriptions: string[] = [];
    let simple = true;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const vertex of component) {
      const x = canonicalPositions[vertex * 3];
      const y = canonicalPositions[vertex * 3 + 1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const localNeighbors = (neighbors.get(vertex) ?? []).filter((next) => componentSet.has(next));
      if (localNeighbors.length !== 2) simple = false;
      const incident = localNeighbors
        .map((next) => `(${canonicalPositions[next * 3].toFixed(2)},${canonicalPositions[next * 3 + 1].toFixed(2)})`)
        .join(",");
      vertexDescriptions.push(
        `(${x.toFixed(2)},${y.toFixed(2)}):d=${localNeighbors.length}->${incident}`,
      );
    }

    if (!simple) {
      descriptions.push(
        `bbox=${minX.toFixed(1)},${minY.toFixed(1)}:${maxX.toFixed(1)},${maxY.toFixed(1)} vertices=${vertexDescriptions.join("/")}`,
      );
    }
  }

  return descriptions.join(" || ");
}

export function getMeshDiagnostics(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
  zValue = 0,
): MeshDiagnostics {
  const vertexCount = mesh.vertices.length / 3;
  const triangleCount = mesh.indices.length / 3;
  const components = countConnectedMeshComponents(mesh, tolerance);
  const nonManifoldEdges = countNonManifoldEdges(mesh, tolerance);
  const boundaryEdges = countBoundaryEdges(mesh, tolerance);
  const boundaryLoops = countBoundaryLoopsAtZ(mesh, zValue, tolerance);
  const watertight = components === 1 && nonManifoldEdges === 0 && boundaryEdges === 0;

  return {
    vertexCount,
    triangleCount,
    components,
    nonManifoldEdges,
    boundaryEdges,
    boundaryLoops,
    watertight,
  };
}

export function logMeshDiagnostics(
  label: string,
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
  zValue = 0,
): MeshDiagnostics {
  const diagnostics = getMeshDiagnostics(mesh, tolerance, zValue);
  console.info(
    `${label}: vertices=${diagnostics.vertexCount} triangles=${diagnostics.triangleCount} components=${diagnostics.components} nonManifold=${diagnostics.nonManifoldEdges} boundaryEdges=${diagnostics.boundaryEdges} boundaryLoops=${diagnostics.boundaryLoops} watertight=${diagnostics.watertight}`,
  );
  return diagnostics;
}

export function retainLargestConnectedMeshComponent(
  mesh: MeshData,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): MeshData {
  const { canonicalVertexByOriginal } = canonicalizeVertices(mesh, tolerance);
  const triangleCount = mesh.indices.length / 3;
  const validTriangle = new Uint8Array(triangleCount);
  const edgeOwners = new Map<string, number[]>();
  const neighbors = Array.from({ length: triangleCount }, () => [] as number[]);

  for (let tri = 0; tri < triangleCount; tri++) {
    const a = canonicalVertexByOriginal[mesh.indices[tri * 3]];
    const b = canonicalVertexByOriginal[mesh.indices[tri * 3 + 1]];
    const c = canonicalVertexByOriginal[mesh.indices[tri * 3 + 2]];
    if (a === b || b === c || a === c) continue;

    validTriangle[tri] = 1;
    const edges = [
      a < b ? `${a}:${b}` : `${b}:${a}`,
      b < c ? `${b}:${c}` : `${c}:${b}`,
      c < a ? `${c}:${a}` : `${a}:${c}`,
    ];

    for (const edge of edges) {
      const owners = edgeOwners.get(edge);
      if (owners) {
        owners.push(tri);
      } else {
        edgeOwners.set(edge, [tri]);
      }
    }
  }

  for (const owners of edgeOwners.values()) {
    if (owners.length !== 2) continue;
    const [a, b] = owners;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  const visited = new Uint8Array(triangleCount);
  let bestComponent: number[] | null = null;

  for (let tri = 0; tri < triangleCount; tri++) {
    if (!validTriangle[tri] || visited[tri]) continue;

    const component: number[] = [];
    const stack = [tri];
    visited[tri] = 1;

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of neighbors[current]) {
        if (!visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    if (!bestComponent || component.length > bestComponent.length) {
      bestComponent = component;
    }
  }

  if (!bestComponent || bestComponent.length === triangleCount) {
    return mesh;
  }

  const nextVertices: number[] = [];
  const nextIndices: number[] = [];
  const vertexMap = new Map<number, number>();

  for (const tri of bestComponent) {
    for (let i = 0; i < 3; i++) {
      const originalIndex = mesh.indices[tri * 3 + i];
      let nextIndex = vertexMap.get(originalIndex);
      if (nextIndex === undefined) {
        nextIndex = nextVertices.length / 3;
        vertexMap.set(originalIndex, nextIndex);
        nextVertices.push(
          mesh.vertices[originalIndex * 3],
          mesh.vertices[originalIndex * 3 + 1],
          mesh.vertices[originalIndex * 3 + 2],
        );
      }
      nextIndices.push(nextIndex);
    }
  }

  return {
    vertices: new Float32Array(nextVertices),
    indices: new Uint32Array(nextIndices),
  };
}

export function removeSmallEdgeConnectedComponents(
  mesh: MeshData,
  maxTriangleCount: number,
  maxZ: number,
  tolerance = DEFAULT_WELD_TOLERANCE_MM,
): MeshData {
  const { canonicalVertexByOriginal } = canonicalizeVertices(mesh, tolerance);
  const triangleCount = mesh.indices.length / 3;
  const validTriangle = new Uint8Array(triangleCount);
  const edgeOwners = new Map<string, number[]>();
  const neighbors = Array.from({ length: triangleCount }, () => [] as number[]);

  for (let tri = 0; tri < triangleCount; tri++) {
    const a = canonicalVertexByOriginal[mesh.indices[tri * 3]];
    const b = canonicalVertexByOriginal[mesh.indices[tri * 3 + 1]];
    const c = canonicalVertexByOriginal[mesh.indices[tri * 3 + 2]];
    if (a === b || b === c || a === c) continue;

    validTriangle[tri] = 1;
    const edges = [
      a < b ? `${a}:${b}` : `${b}:${a}`,
      b < c ? `${b}:${c}` : `${c}:${b}`,
      c < a ? `${c}:${a}` : `${a}:${c}`,
    ];

    for (const edge of edges) {
      const owners = edgeOwners.get(edge);
      if (owners) owners.push(tri);
      else edgeOwners.set(edge, [tri]);
    }
  }

  for (const owners of edgeOwners.values()) {
    if (owners.length !== 2) continue;
    const [a, b] = owners;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  const visited = new Uint8Array(triangleCount);
  const keptTriangles: number[] = [];
  let removedAny = false;

  for (let tri = 0; tri < triangleCount; tri++) {
    if (!validTriangle[tri] || visited[tri]) continue;

    const component: number[] = [];
    const stack = [tri];
    visited[tri] = 1;
    let componentMaxZ = Number.NEGATIVE_INFINITY;

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (let offset = 0; offset < 3; offset++) {
        const vertexIndex = mesh.indices[current * 3 + offset];
        componentMaxZ = Math.max(componentMaxZ, mesh.vertices[vertexIndex * 3 + 2]);
      }
      for (const next of neighbors[current]) {
        if (!visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    if (component.length <= maxTriangleCount && componentMaxZ <= maxZ) {
      removedAny = true;
      continue;
    }

    keptTriangles.push(...component);
  }

  if (!removedAny) return mesh;

  const nextVertices: number[] = [];
  const nextIndices: number[] = [];
  const vertexMap = new Map<number, number>();

  for (const tri of keptTriangles) {
    for (let i = 0; i < 3; i++) {
      const originalIndex = mesh.indices[tri * 3 + i];
      let nextIndex = vertexMap.get(originalIndex);
      if (nextIndex === undefined) {
        nextIndex = nextVertices.length / 3;
        vertexMap.set(originalIndex, nextIndex);
        nextVertices.push(
          mesh.vertices[originalIndex * 3],
          mesh.vertices[originalIndex * 3 + 1],
          mesh.vertices[originalIndex * 3 + 2],
        );
      }
      nextIndices.push(nextIndex);
    }
  }

  return {
    vertices: new Float32Array(nextVertices),
    indices: new Uint32Array(nextIndices),
  };
}
