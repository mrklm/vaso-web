import type { Profile } from "./types";

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

/**
 * Build a resampled contour for a profile.
 */
export function buildProfileContour(profile: Profile, samples: number): Float64Array {
  const polygon = regularPolygonVertices(profile);
  return resampleClosedContour(polygon, samples);
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
