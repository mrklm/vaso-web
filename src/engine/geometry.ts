import type { Profile } from "./types";

const SEAM_BACK_ANGLE_RAD = -Math.PI / 2;
const SEAM_SWITCH_MIN_IMPROVEMENT_MM = 0.35;

/**
 * Generate vertices of a regular polygon for a given profile.
 * Returns Nx2 array as flat pairs [x0,y0, x1,y1, ...].
 */
export function regularPolygonVertices(profile: Profile): Float64Array {
  const radius = profile.diameter / 2;
  const rotation = (profile.rotationDeg * Math.PI) / 180;
  const n = profile.sides;
  const result = new Float64Array(n * 2);

  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + rotation;
    result[i * 2] = Math.cos(angle) * radius * profile.scaleX + profile.offsetX;
    result[i * 2 + 1] = Math.sin(angle) * radius * profile.scaleY + profile.offsetY;
  }
  return result;
}

/**
 * Resample a closed contour to have exactly `samples` evenly spaced points.
 * Input: Nx2 flat array. Output: samples*2 flat array.
 */
export function resampleClosedContour(vertices: Float64Array, samples: number): Float64Array {
  const n = vertices.length / 2;
  if (n < 3) throw new Error("Un contour fermé doit contenir au moins 3 points.");

  // Compute edge lengths and cumulative distances
  const lengths = new Float64Array(n);
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const ax = vertices[i * 2],
      ay = vertices[i * 2 + 1];
    const ni = (i + 1) % n;
    const bx = vertices[ni * 2],
      by = vertices[ni * 2 + 1];
    const dx = bx - ax,
      dy = by - ay;
    lengths[i] = Math.sqrt(dx * dx + dy * dy);
    perimeter += lengths[i];
  }

  if (perimeter <= 0) throw new Error("Périmètre nul détecté sur un contour.");

  const cumulative = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    cumulative[i + 1] = cumulative[i] + lengths[i];
  }

  const result = new Float64Array(samples * 2);
  let edgeIndex = 0;

  for (let s = 0; s < samples; s++) {
    const dist = (perimeter * s) / samples;

    while (!(cumulative[edgeIndex] <= dist && dist < cumulative[edgeIndex + 1])) {
      edgeIndex++;
      if (edgeIndex >= n) {
        edgeIndex = n - 1;
        break;
      }
    }

    const ax = vertices[edgeIndex * 2],
      ay = vertices[edgeIndex * 2 + 1];
    const ni = (edgeIndex + 1) % n;
    const bx = vertices[ni * 2],
      by = vertices[ni * 2 + 1];
    const edgeLen = lengths[edgeIndex];

    if (edgeLen === 0) {
      result[s * 2] = ax;
      result[s * 2 + 1] = ay;
      continue;
    }

    const t = (dist - cumulative[edgeIndex]) / edgeLen;
    result[s * 2] = (1 - t) * ax + t * bx;
    result[s * 2 + 1] = (1 - t) * ay + t * by;
  }
  return result;
}

function normalizedAngularDistance(a: number, b: number): number {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(diff);
}

function computeSeamTargetPoint(vertices: Float64Array, profile: Profile): { x: number; y: number } {
  const n = vertices.length / 2;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestX = vertices[0];
  let bestY = vertices[1];

  for (let i = 0; i < n; i++) {
    const ax = vertices[i * 2];
    const ay = vertices[i * 2 + 1];
    const sampleX = ax;
    const sampleY = ay;
    const angle = Math.atan2(sampleY - profile.offsetY, sampleX - profile.offsetX);
    const score = normalizedAngularDistance(angle, SEAM_BACK_ANGLE_RAD);

    if (score < bestScore) {
      bestScore = score;
      bestX = sampleX;
      bestY = sampleY;
    }
  }

  return { x: bestX, y: bestY };
}

function rotateContourToNearestPoint(contour: Float64Array, targetX: number, targetY: number): Float64Array {
  const n = contour.length / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < n; i++) {
    const dx = contour[i * 2] - targetX;
    const dy = contour[i * 2 + 1] - targetY;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  if (bestIndex === 0) return contour;

  const result = new Float64Array(contour.length);
  for (let i = 0; i < n; i++) {
    const src = (bestIndex + i) % n;
    result[i * 2] = contour[src * 2];
    result[i * 2 + 1] = contour[src * 2 + 1];
  }
  return result;
}

export function alignContourToPrevious(contour: Float64Array, previousContour: Float64Array): Float64Array {
  const n = contour.length / 2;
  if (n === 0 || previousContour.length !== contour.length) return contour;

  const scoreShift = (shift: number): number => {
    let score = 0;
    for (let i = 0; i < n; i++) {
      const prevX = previousContour[i * 2];
      const prevY = previousContour[i * 2 + 1];
      const src = (shift + i) % n;
      const dx = contour[src * 2] - prevX;
      const dy = contour[src * 2 + 1] - prevY;
      score += dx * dx + dy * dy;
    }
    return score / n;
  };

  const zeroShiftScore = scoreShift(0);
  let bestShift = 0;
  let bestScore = zeroShiftScore;

  for (let shift = 1; shift < n; shift++) {
    const score = scoreShift(shift);
    if (score < bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  if (bestShift === 0) return contour;

  const improvement = Math.sqrt(Math.max(0, zeroShiftScore)) - Math.sqrt(Math.max(0, bestScore));
  if (improvement < SEAM_SWITCH_MIN_IMPROVEMENT_MM) {
    return contour;
  }

  const result = new Float64Array(contour.length);
  for (let i = 0; i < n; i++) {
    const src = (bestShift + i) % n;
    result[i * 2] = contour[src * 2];
    result[i * 2 + 1] = contour[src * 2 + 1];
  }
  return result;
}

/**
 * Build a resampled contour for a profile.
 */
export function buildProfileContour(profile: Profile, samples: number): Float64Array {
  const polygon = regularPolygonVertices(profile);
  const contour = resampleClosedContour(polygon, samples);
  const seamTarget = computeSeamTargetPoint(polygon, profile);
  return rotateContourToNearestPoint(contour, seamTarget.x, seamTarget.y);
}

/**
 * Linearly interpolate between two contours (same length).
 */
export function interpolateContours(c1: Float64Array, c2: Float64Array, t: number): Float64Array {
  const result = new Float64Array(c1.length);
  const inv = 1 - t;
  for (let i = 0; i < c1.length; i++) {
    result[i] = inv * c1[i] + t * c2[i];
  }
  return result;
}
