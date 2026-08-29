import type { VaseParameters, TextureType, TextureZoom } from "./types";

function textureZoomToParams(zoom: TextureZoom): [number, number] {
  const mapping: Record<TextureZoom, [number, number]> = {
    "Très fin": [1.0, 22.0],
    Fin: [1.8, 14.0],
    Moyen: [3.0, 9.0],
    Gros: [4.4, 5.5],
    "Très gros": [6.0, 3.2],
    Énorme: [14.0, 2.4],
  };
  return mapping[zoom] ?? mapping["Moyen"];
}

function getTextureAmplitudeMm(textureType: TextureType, textureZoom: TextureZoom): number {
  if (textureType === "Aucune") return 0;
  return textureZoomToParams(textureZoom)[0];
}

export function getMaxInwardTextureOffsetMm(params: VaseParameters): number {
  if (params.textureMode === "Pas de texture") return 0;

  if (params.textureMode === "Texture aléatoire" || params.textureMode === "Texture imposée") {
    return getTextureAmplitudeMm(params.textureType, params.textureZoom);
  }

  if (params.textureMode === "Double texture") {
    return Math.max(
      getTextureAmplitudeMm(params.textureType, params.textureZoom),
      getTextureAmplitudeMm(params.textureType2, params.textureZoom2),
    );
  }

  return 0;
}

export function usesLowPolyTexture(params: VaseParameters): boolean {
  if (params.textureMode === "Pas de texture") return false;
  if (params.textureMode === "Double texture") {
    return params.textureType === "LowPoly" || params.textureType2 === "LowPoly";
  }
  return params.textureType === "LowPoly";
}

export function getLowPolyMeshResolution(params: VaseParameters): {
  radialSamples: number;
  verticalSamples: number;
} | null {
  if (!usesLowPolyTexture(params)) return null;

  const zoom =
    params.textureType === "LowPoly"
      ? params.textureZoom
      : params.textureType2 === "LowPoly"
        ? params.textureZoom2
        : params.textureZoom;
  const [, baseFrequency] = textureZoomToParams(zoom);
  return {
    radialSamples: Math.max(8, Math.min(params.radialSamples, Math.round(baseFrequency * 1.12))),
    verticalSamples: Math.max(6, Math.min(params.verticalSamples, Math.round(baseFrequency * 0.84))),
  };
}

function staggeredVerticalWave(
  angle: number,
  angularFrequency: number,
  verticalFrequency: number,
  zRatio: number,
): number {
  const PI2 = 2 * Math.PI;
  const angularPhase =
    0.52 * Math.sin(angularFrequency * angle) +
    0.18 * Math.sin((angularFrequency * 0.5 + 1.0) * angle);
  return Math.sin(PI2 * verticalFrequency * zRatio + angularPhase);
}

function hash01(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function lowPolyCornerOffset(cellX: number, cellY: number, angularCells: number): number {
  const wrappedX = ((cellX % angularCells) + angularCells) % angularCells;
  const random = hash01(wrappedX, cellY, 0.37) * 2 - 1;
  const wave =
    0.46 * Math.sin((wrappedX / angularCells) * Math.PI * 2 + cellY * 0.78) +
    0.34 * Math.cos((wrappedX / angularCells) * Math.PI * 4 - cellY * 0.52) +
    0.2 * random;
  return Math.round(Math.max(-1, Math.min(1, wave)) * 2) / 2;
}

function lowPolyFacetOffset(
  angle: number,
  zRatio: number,
  angularCells: number,
  verticalCells: number,
): number {
  const PI2 = 2 * Math.PI;
  const u = ((angle + PI2) % PI2) / PI2;
  const v = Math.max(0, Math.min(1, zRatio));

  const gridX = u * angularCells;
  const cellX = Math.floor(gridX);
  const localX = gridX - cellX;

  const gridY = v * verticalCells;
  const cellY = Math.min(verticalCells - 1, Math.floor(gridY));
  const localY = cellY === verticalCells - 1 && gridY >= verticalCells ? 1 : gridY - cellY;

  const bottomLeft = lowPolyCornerOffset(cellX, cellY, angularCells);
  const bottomRight = lowPolyCornerOffset(cellX + 1, cellY, angularCells);
  const topLeft = lowPolyCornerOffset(cellX, cellY + 1, angularCells);
  const topRight = lowPolyCornerOffset(cellX + 1, cellY + 1, angularCells);

  if (localX + localY <= 1) {
    return bottomLeft + (bottomRight - bottomLeft) * localX + (topLeft - bottomLeft) * localY;
  }

  const inverseX = 1 - localX;
  const inverseY = 1 - localY;
  return topRight + (topLeft - topRight) * inverseX + (bottomRight - topRight) * inverseY;
}

/**
 * Apply a single texture to a contour (Nx2 flat Float64Array).
 * Returns a new contour with the texture applied.
 */
export function applySingleTexture(
  contour: Float64Array,
  zMm: number,
  textureType: TextureType,
  textureZoom: TextureZoom,
  params: VaseParameters,
): Float64Array {
  if (textureType === "Aucune") return contour;

  const [amplitudeMm, baseFrequency] = textureZoomToParams(textureZoom);
  const angularCycles = Math.max(1, Math.round(baseFrequency));
  const pts = new Float64Array(contour);
  const n = pts.length / 2;
  if (n === 0) return pts;

  const zRatio = params.heightMm <= 0 ? 0 : zMm / params.heightMm;
  const PI2 = 2 * Math.PI;

  // Precompute radii and angles
  const radii = new Float64Array(n);
  const angles = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2],
      y = pts[i * 2 + 1];
    radii[i] = Math.sqrt(x * x + y * y);
    angles[i] = Math.atan2(y, x);
  }

  const envelope = 0.55 + 0.45 * Math.sin(Math.PI * zRatio);
  const offset = new Float64Array(n);

  switch (textureType) {
    case "Cannelures":
      for (let i = 0; i < n; i++)
        offset[i] = amplitudeMm * envelope * Math.cos(angularCycles * angles[i]);
      break;

    case "Anneaux":
      {
        const val = amplitudeMm * envelope * Math.sin(PI2 * baseFrequency * 1.55 * zRatio);
        for (let i = 0; i < n; i++) offset[i] = val;
      }
      break;

    case "Spirale":
      for (let i = 0; i < n; i++)
        offset[i] =
          amplitudeMm * envelope * Math.sin(angles[i] + PI2 * baseFrequency * 0.26 * zRatio);
      break;

    case "Double spirale":
      {
        const speed = baseFrequency * 0.12;
        for (let i = 0; i < n; i++) {
          const amp = amplitudeMm * (0.4 + 0.6 * zRatio);
          offset[i] = amp * Math.sin(2 * angles[i] + PI2 * speed * zRatio);
        }
      }
      break;

    case "Triple spirale":
      for (let i = 0; i < n; i++)
        offset[i] =
          amplitudeMm * envelope * Math.sin(3 * angles[i] + PI2 * baseFrequency * 0.24 * zRatio);
      break;

    case "Bulles":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.62);
        const vertical = staggeredVerticalWave(angles[i], angularCycles, bf, zRatio);
        const bubble = Math.exp(
          -(2.8 * Math.sin(angularCycles * angles[i]) ** 2 + 2.2 * vertical ** 2),
        );
        offset[i] = amplitudeMm * envelope * (bubble - 0.3);
      }
      break;

    case "Hexagones":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.65);
        const vertical = staggeredVerticalWave(angles[i], angularCycles, bf, zRatio);
        const cell = Math.sin(angularCycles * angles[i]) * vertical;
        const quantized = Math.round(cell * 4) / 4;
        offset[i] = amplitudeMm * envelope * quantized;
      }
      break;

    case "LowPoly":
      {
        const angularCells = Math.max(4, Math.round(baseFrequency * 0.72));
        const verticalCells = Math.max(3, Math.round(baseFrequency * 0.46));
        const facetAmplitude = amplitudeMm * 0.82;
        for (let i = 0; i < n; i++) {
          offset[i] =
            facetAmplitude *
            envelope *
            lowPolyFacetOffset(angles[i], zRatio, angularCells, verticalCells);
        }
      }
      break;

    case "Martelé":
      for (let i = 0; i < n; i++) {
        offset[i] =
          amplitudeMm *
          envelope *
          (0.6 * Math.sin(5 * angles[i] + PI2 * 3 * zRatio) +
            0.25 * Math.sin(10 * angles[i] - PI2 * 1.7 * zRatio) +
            0.15 * Math.cos(13 * angles[i] + PI2 * 4.2 * zRatio));
      }
      break;

    case "Écailles":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.58);
        const vertical = staggeredVerticalWave(angles[i], angularCycles, bf, zRatio);
        const scales = Math.max(0, Math.sin(angularCycles * angles[i])) * vertical;
        offset[i] = amplitudeMm * envelope * scales;
      }
      break;

    case "Diamants":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.72);
        const vertical = staggeredVerticalWave(angles[i], angularCycles, bf, zRatio);
        const diamonds = Math.sin(angularCycles * angles[i]) * vertical;
        offset[i] = amplitudeMm * envelope * Math.sign(diamonds) * Math.sqrt(Math.abs(diamonds));
      }
      break;

    case "Tressage":
      for (let i = 0; i < n; i++) {
        const sp = baseFrequency * 0.32;
        const a = Math.sin(2 * angles[i] + PI2 * sp * zRatio);
        const b = Math.sin(2 * angles[i] - PI2 * sp * zRatio);
        offset[i] = amplitudeMm * envelope * 0.5 * (a + b);
      }
      break;

    case "Vagues":
      for (let i = 0; i < n; i++) {
        const waves =
          0.7 * Math.sin(angles[i] + PI2 * baseFrequency * 0.2 * zRatio) +
          0.3 * Math.sin(3 * angles[i] - PI2 * baseFrequency * 0.12 * zRatio);
        offset[i] = amplitudeMm * envelope * waves;
      }
      break;

    default:
      return pts;
  }

  // Clamp and apply offsets
  for (let i = 0; i < n; i++) {
    const safeRadius = Math.max(radii[i], 1e-9);
    const maxSafe = Math.max(0.6, radii[i] - params.wallThicknessMm - 1);
    const clampedOffset = Math.max(-0.92 * maxSafe, Math.min(0.92 * maxSafe, offset[i]));
    const newRadius = Math.max(radii[i] + clampedOffset, params.wallThicknessMm + 1);
    const scale = newRadius / safeRadius;
    pts[i * 2] *= scale;
    pts[i * 2 + 1] *= scale;
  }

  return pts;
}

/**
 * Apply texture(s) to a contour based on the texture mode.
 */
export function applyTexture(
  contour: Float64Array,
  zMm: number,
  params: VaseParameters,
): Float64Array {
  const mode = params.textureMode;

  if (mode === "Pas de texture") return contour;

  if (mode === "Texture aléatoire" || mode === "Texture imposée") {
    return applySingleTexture(contour, zMm, params.textureType, params.textureZoom, params);
  }

  if (mode === "Double texture") {
    const t1 = params.textureType;
    const t2 = params.textureType2;
    if (t1 === "Aucune" && t2 === "Aucune") return contour;
    if (t1 !== "Aucune" && t2 === "Aucune")
      return applySingleTexture(contour, zMm, t1, params.textureZoom, params);
    if (t1 === "Aucune" && t2 !== "Aucune")
      return applySingleTexture(contour, zMm, t2, params.textureZoom2, params);

    const c1 = applySingleTexture(contour, zMm, t1, params.textureZoom, params);
    const c2 = applySingleTexture(contour, zMm, t2, params.textureZoom2, params);
    const result = new Float64Array(c1.length);
    for (let i = 0; i < c1.length; i++) result[i] = (c1[i] + c2[i]) / 2;
    return result;
  }

  return contour;
}
