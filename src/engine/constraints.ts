const SUPPORTLESS_MAX_OVERHANG_DEG = 42.0;
const OFFSET_EPSILON = 1e-9;

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
 * Compute a polygon's signed area to determine winding.
 */
function signedArea(contour: Float64Array): number {
  const n = contour.length / 2;
  let area = 0;

  for (let i = 0; i < n; i++) {
    const ax = contour[i * 2];
    const ay = contour[i * 2 + 1];
    const bi = (i + 1) % n;
    const bx = contour[bi * 2];
    const by = contour[bi * 2 + 1];
    area += ax * by - bx * ay;
  }

  return area * 0.5;
}

function intersectLines(
  px: number,
  py: number,
  rx: number,
  ry: number,
  qx: number,
  qy: number,
  sx: number,
  sy: number,
): [number, number] | null {
  const cross = rx * sy - ry * sx;
  if (Math.abs(cross) <= OFFSET_EPSILON) return null;

  const qpx = qx - px;
  const qpy = qy - py;
  const t = (qpx * sy - qpy * sx) / cross;
  return [px + rx * t, py + ry * t];
}

/**
 * Compute the inner contour using a constant-distance polygon offset.
 */
export function computeInnerContour(outer: Float64Array, wallThicknessMm: number): Float64Array {
  const n = outer.length / 2;
  if (n < 3) {
    throw new Error("Section intérieure invalide : le contour doit contenir au moins 3 points.");
  }

  const area = signedArea(outer);
  if (Math.abs(area) <= OFFSET_EPSILON) {
    throw new Error("Section intérieure invalide : contour dégénéré.");
  }

  const inwardSign = area > 0 ? 1 : -1;
  const result = new Float64Array(n * 2);

  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;

    const px = outer[prev * 2];
    const py = outer[prev * 2 + 1];
    const cx = outer[i * 2];
    const cy = outer[i * 2 + 1];
    const nx = outer[next * 2];
    const ny = outer[next * 2 + 1];

    const prevDx = cx - px;
    const prevDy = cy - py;
    const nextDx = nx - cx;
    const nextDy = ny - cy;

    const prevLen = Math.hypot(prevDx, prevDy);
    const nextLen = Math.hypot(nextDx, nextDy);
    if (prevLen <= OFFSET_EPSILON || nextLen <= OFFSET_EPSILON) {
      throw new Error("Section intérieure invalide : arête dégénérée.");
    }

    const prevNormalX = inwardSign * (-prevDy / prevLen);
    const prevNormalY = inwardSign * (prevDx / prevLen);
    const nextNormalX = inwardSign * (-nextDy / nextLen);
    const nextNormalY = inwardSign * (nextDx / nextLen);

    const prevOffsetX = cx + prevNormalX * wallThicknessMm;
    const prevOffsetY = cy + prevNormalY * wallThicknessMm;
    const nextOffsetX = cx + nextNormalX * wallThicknessMm;
    const nextOffsetY = cy + nextNormalY * wallThicknessMm;

    const intersection = intersectLines(
      prevOffsetX,
      prevOffsetY,
      prevDx,
      prevDy,
      nextOffsetX,
      nextOffsetY,
      nextDx,
      nextDy,
    );

    if (intersection) {
      result[i * 2] = intersection[0];
      result[i * 2 + 1] = intersection[1];
      continue;
    }

    const avgNormalX = prevNormalX + nextNormalX;
    const avgNormalY = prevNormalY + nextNormalY;
    const avgNormalLen = Math.hypot(avgNormalX, avgNormalY);
    if (avgNormalLen <= OFFSET_EPSILON) {
      throw new Error("Section intérieure invalide : réduire épaisseur ou augmenter diamètre.");
    }

    result[i * 2] = cx + (avgNormalX / avgNormalLen) * wallThicknessMm;
    result[i * 2 + 1] = cy + (avgNormalY / avgNormalLen) * wallThicknessMm;
  }

  return result;
}
