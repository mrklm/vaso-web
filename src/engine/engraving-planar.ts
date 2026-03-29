import * as THREE from "three";
import ClipperShape from "@doodle3d/clipper-js";

const DEFAULT_PLANAR_PATCH_TOLERANCE_MM = 1e-4;
const DEFAULT_PLANAR_SIMPLIFICATION_MM = 0.05;
const DEFAULT_CLIPPER_SCALE = 1000;

export interface PlanarPolygon {
  contour: THREE.Vector2[];
  holes: THREE.Vector2[][];
}

export interface OffsetPlanarPolygonOptions {
  clipperScale?: number;
  minFeatureMm?: number;
  sanitizeToleranceMm?: number;
}

export interface OffsetPlanarPolygonResult {
  polygons: PlanarPolygon[];
  removedContours: number;
  removedHoles: number;
}

function isColinearIntermediatePoint(
  previous: THREE.Vector2,
  current: THREE.Vector2,
  next: THREE.Vector2,
  tolerance: number,
): boolean {
  const chordX = next.x - previous.x;
  const chordY = next.y - previous.y;
  const chordLength = Math.hypot(chordX, chordY);
  if (chordLength <= tolerance) return true;

  const area2 = Math.abs(
    (current.x - previous.x) * chordY -
    (current.y - previous.y) * chordX,
  );
  const distanceFromChord = area2 / chordLength;
  if (distanceFromChord > tolerance) return false;

  const dot =
    (previous.x - current.x) * (next.x - current.x) +
    (previous.y - current.y) * (next.y - current.y);
  return dot <= tolerance * tolerance;
}

export function sanitizePlanarContour(
  points: THREE.Vector2[],
  tolerance = DEFAULT_PLANAR_PATCH_TOLERANCE_MM,
): THREE.Vector2[] {
  if (points.length === 0) return [];

  const squaredTolerance = tolerance * tolerance;
  const cleaned: THREE.Vector2[] = [];

  for (const point of points) {
    const nextPoint = new THREE.Vector2(point.x, point.y);
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.distanceToSquared(nextPoint) > squaredTolerance) {
      cleaned.push(nextPoint);
    }
  }

  if (cleaned.length >= 2 && cleaned[0].distanceToSquared(cleaned[cleaned.length - 1]) <= squaredTolerance) {
    cleaned.pop();
  }

  if (cleaned.length < 3) return cleaned;

  let changed = true;
  while (changed && cleaned.length >= 3) {
    changed = false;

    for (let index = 0; index < cleaned.length; index++) {
      const previous = cleaned[(index + cleaned.length - 1) % cleaned.length];
      const current = cleaned[index];
      const next = cleaned[(index + 1) % cleaned.length];
      if (!isColinearIntermediatePoint(previous, current, next, tolerance)) continue;

      cleaned.splice(index, 1);
      changed = true;
      break;
    }
  }

  return cleaned;
}

function computeContourBounds(contour: THREE.Vector2[]): { width: number; height: number } {
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

  return {
    width: maxX - minX,
    height: maxY - minY,
  };
}

function meetsMinimumFeature(contour: THREE.Vector2[], minFeatureMm: number): boolean {
  if (minFeatureMm <= 0) return true;
  const { width, height } = computeContourBounds(contour);
  return width >= minFeatureMm && height >= minFeatureMm;
}

function withWinding(contour: THREE.Vector2[], clockwise: boolean): THREE.Vector2[] {
  if (contour.length < 3) return contour;
  const isClockwise = THREE.ShapeUtils.isClockWise(contour);
  if (isClockwise === clockwise) return contour;
  return [...contour].reverse();
}

function contourToClipperPath(contour: THREE.Vector2[], clipperScale: number): { x: number; y: number }[] {
  return contour.map((point) => ({
    x: point.x * clipperScale,
    y: point.y * clipperScale,
  }));
}

function clipperPathToContour(path: { x: number; y: number }[], clipperScale: number): THREE.Vector2[] {
  return path.map((point) => new THREE.Vector2(point.x / clipperScale, point.y / clipperScale));
}

export function offsetPlanarPolygon(
  polygon: PlanarPolygon,
  offsetMm: number,
  options: OffsetPlanarPolygonOptions = {},
): OffsetPlanarPolygonResult {
  const clipperScale = options.clipperScale ?? DEFAULT_CLIPPER_SCALE;
  const minFeatureMm = options.minFeatureMm ?? 0;
  const sanitizeToleranceMm = options.sanitizeToleranceMm ?? DEFAULT_PLANAR_SIMPLIFICATION_MM;
  let removedContours = 0;
  let removedHoles = 0;

  const sanitizedContour = sanitizePlanarContour(polygon.contour, sanitizeToleranceMm);
  if (sanitizedContour.length < 3 || !meetsMinimumFeature(sanitizedContour, minFeatureMm)) {
    return { polygons: [], removedContours: 1, removedHoles: polygon.holes.length };
  }

  const sanitizedHoles = polygon.holes
    .map((hole) => sanitizePlanarContour(hole, sanitizeToleranceMm))
    .filter((hole) => {
      if (hole.length < 3 || !meetsMinimumFeature(hole, minFeatureMm)) {
        removedHoles += 1;
        return false;
      }
      return true;
    });

  const clipperPaths = [
    contourToClipperPath(withWinding(sanitizedContour, true), clipperScale),
    ...sanitizedHoles.map((hole) => contourToClipperPath(withWinding(hole, false), clipperScale)),
  ];

  const cleanDelta = Math.max(1, Math.round(sanitizeToleranceMm * clipperScale));
  const clipperShape = new ClipperShape(clipperPaths, true, true, true, true)
    .clean(cleanDelta)
    .simplify("pftNonZero");

  const offsetShape = Math.abs(offsetMm) > 0
    ? clipperShape.offset(offsetMm * clipperScale, {
      jointType: "jtRound",
      endType: "etClosedPolygon",
      roundPrecision: Math.max(1, (offsetMm * clipperScale) * 0.25),
    }).clean(cleanDelta).simplify("pftNonZero")
    : clipperShape;

  const polygons = offsetShape
    .separateShapes()
    .map((shape) => shape.mapToLower())
    .map((paths) => {
      const [outerPath, ...holePaths] = paths;
      if (!outerPath) return null;

      const contour = sanitizePlanarContour(clipperPathToContour(outerPath, clipperScale), sanitizeToleranceMm);
      if (contour.length < 3 || !meetsMinimumFeature(contour, minFeatureMm)) {
        removedContours += 1;
        removedHoles += holePaths.length;
        return null;
      }

      const holes = holePaths
        .map((hole) => sanitizePlanarContour(clipperPathToContour(hole, clipperScale), sanitizeToleranceMm))
        .filter((hole) => {
          if (hole.length < 3 || !meetsMinimumFeature(hole, minFeatureMm)) {
            removedHoles += 1;
            return false;
          }
          return true;
        });

      return { contour, holes };
    })
    .filter((polygonShape): polygonShape is PlanarPolygon => polygonShape !== null);

  return { polygons, removedContours, removedHoles };
}
