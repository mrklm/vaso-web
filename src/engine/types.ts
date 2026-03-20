// ── Data model (port of model.py) ──

export interface Profile {
  zRatio: number; // 0.0–1.0, height position
  diameter: number; // mm
  sides: number; // 3–100
  rotationDeg: number; // degrees
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export function createProfile(
  partial: Partial<Profile> & Pick<Profile, "zRatio" | "diameter" | "sides" | "rotationDeg">,
): Profile {
  return {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    ...partial,
  };
}

export const TEXTURE_TYPES = [
  "Aucune",
  "Cannelures",
  "Anneaux",
  "Spirale",
  "Double spirale",
  "Triple spirale",
  "Bulles",
  "Hexagones",
  "LowPoly",
  "Martelé",
  "Écailles",
  "Diamants",
  "Tressage",
  "Vagues",
] as const;
export type TextureType = (typeof TEXTURE_TYPES)[number];

export const TEXTURE_ZOOMS = ["Très fin", "Fin", "Moyen", "Gros", "Très gros", "Énorme"] as const;
export type TextureZoom = (typeof TEXTURE_ZOOMS)[number];

export const TEXTURE_MODES = [
  "Pas de texture",
  "Texture aléatoire",
  "Texture imposée",
  "Double texture",
] as const;
export type TextureMode = (typeof TEXTURE_MODES)[number];

export const RANDOM_STYLES = [
  "Soft",
  "Raw",
  "Twisted",
  "Architectural",
  "Organic",
  "Tapered",
  "Bulbous",
  "Pure Random",
] as const;
export type RandomStyle = (typeof RANDOM_STYLES)[number];

export const COMPLEXITY_LEVELS = ["Sobre", "Moyen", "Complexe"] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

export interface VaseParameters {
  heightMm: number;
  wallThicknessMm: number;
  bottomThicknessMm: number;
  radialSamples: number;
  verticalSamples: number;
  openTop: boolean;
  closeBottom: boolean;
  textureMode: TextureMode;
  textureType: TextureType;
  textureZoom: TextureZoom;
  textureType2: TextureType;
  textureZoom2: TextureZoom;
  profiles: Profile[];
}

export function defaultVaseParameters(): VaseParameters {
  return {
    heightMm: 180,
    wallThicknessMm: 2.4,
    bottomThicknessMm: 3.0,
    radialSamples: 96,
    verticalSamples: 120,
    openTop: true,
    closeBottom: true,
    textureMode: "Pas de texture",
    textureType: "Aucune",
    textureZoom: "Moyen",
    textureType2: "Aucune",
    textureZoom2: "Moyen",
    profiles: [
      createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 }),
      createProfile({ zRatio: 1, diameter: 60, sides: 6, rotationDeg: 30 }),
    ],
  };
}

export interface MeshData {
  vertices: Float32Array; // x,y,z flat
  indices: Uint32Array; // triangle indices flat
}
