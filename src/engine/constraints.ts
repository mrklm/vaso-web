const SUPPORTLESS_MAX_OVERHANG_DEG = 42.0;

export function maxSupportlessRadialStep(dzMm: number): number {
  return Math.max(0.25, dzMm * Math.tan((SUPPORTLESS_MAX_OVERHANG_DEG * Math.PI) / 180));
}

/**
 * Limit each point's radius change from the previous layer.
 * Contours are Nx2 flat Float64Array.
 */
export function limitContourStepFromPrevious(
  previous: Float64Array,
  current: Float64Array,
  maxRadialStepMm: number,
  wallThicknessMm: number,
): Float64Array {
  const n = current.length / 2;
  const result = new Float64Array(current);

  for (let i = 0; i < n; i++) {
    const px = previous[i * 2],
      py = previous[i * 2 + 1];
    const cx = result[i * 2],
      cy = result[i * 2 + 1];

    const prevR = Math.sqrt(px * px + py * py);
    const currR = Math.sqrt(cx * cx + cy * cy);
    const safeCurrR = Math.max(currR, 1e-9);

    const lower = Math.max(wallThicknessMm + 1, prevR - maxRadialStepMm);
    const upper = prevR + maxRadialStepMm;
    const clamped = Math.max(lower, Math.min(upper, currR));
    const scale = clamped / safeCurrR;

    result[i * 2] *= scale;
    result[i * 2 + 1] *= scale;
  }

  return result;
}

/**
 * Compute the inner contour by subtracting wall thickness radially.
 */
export function computeInnerContour(outer: Float64Array, wallThicknessMm: number): Float64Array {
  const n = outer.length / 2;
  const result = new Float64Array(n * 2);

  for (let i = 0; i < n; i++) {
    const x = outer[i * 2],
      y = outer[i * 2 + 1];
    const norm = Math.sqrt(x * x + y * y);
    if (norm <= wallThicknessMm) {
      throw new Error("Section intérieure invalide : réduire épaisseur ou augmenter diamètre.");
    }
    const scale = (norm - wallThicknessMm) / norm;
    result[i * 2] = x * scale;
    result[i * 2 + 1] = y * scale;
  }

  return result;
}
