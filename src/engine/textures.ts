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
        offset[i] = amplitudeMm * envelope * Math.cos(baseFrequency * angles[i]);
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
        const bubble = Math.exp(
          -(
            2.8 * Math.sin(baseFrequency * angles[i]) ** 2 +
            2.2 * Math.sin(PI2 * bf * zRatio) ** 2
          ),
        );
        offset[i] = amplitudeMm * envelope * (bubble - 0.3);
      }
      break;

    case "Hexagones":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.65);
        const cell = Math.sin(baseFrequency * angles[i]) * Math.sin(PI2 * bf * zRatio);
        const quantized = Math.round(cell * 4) / 4;
        offset[i] = amplitudeMm * envelope * quantized;
      }
      break;

    case "LowPoly":
      {
        const step = PI2 / Math.max(6, Math.round(baseFrequency));
        for (let i = 0; i < n; i++) {
          const aq = Math.round(angles[i] / step) * step;
          offset[i] =
            amplitudeMm * envelope * Math.sign(Math.cos(aq * Math.max(3, baseFrequency * 0.8)));
        }
      }
      break;

    case "Martelé":
      for (let i = 0; i < n; i++) {
        offset[i] =
          amplitudeMm *
          envelope *
          (0.6 * Math.sin(5.3 * angles[i] + PI2 * 3 * zRatio) +
            0.25 * Math.sin(9.7 * angles[i] - PI2 * 1.7 * zRatio) +
            0.15 * Math.cos(13.1 * angles[i] + PI2 * 4.2 * zRatio));
      }
      break;

    case "Écailles":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.58);
        const scales =
          Math.max(0, Math.sin(baseFrequency * angles[i])) * Math.sin(PI2 * bf * zRatio);
        offset[i] = amplitudeMm * envelope * scales;
      }
      break;

    case "Diamants":
      for (let i = 0; i < n; i++) {
        const bf = Math.max(2, baseFrequency * 0.72);
        const diamonds = Math.sin(baseFrequency * angles[i]) * Math.sin(PI2 * bf * zRatio);
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
