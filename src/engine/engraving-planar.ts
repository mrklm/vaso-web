import * as THREE from "three";

const DEFAULT_PLANAR_PATCH_TOLERANCE_MM = 1e-4;

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
