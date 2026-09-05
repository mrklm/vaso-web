import {
  COMPLEXITY_LEVELS,
  RANDOM_STYLES,
  TEXTURE_MODES,
  TEXTURE_TYPES,
  TEXTURE_ZOOMS,
  type ComplexityLevel,
  type Profile,
  type RandomStyle,
  type VaseParameters,
} from "./types";
import { validateParams } from "./validation";

export const PRODUCTION_VASE_SCHEMA = "vaso-production-vase-v1";

export interface ProductionVaseJson {
  schema: typeof PRODUCTION_VASE_SCHEMA;
  seed: number;
  version?: string;
  forceTestTubeSupport?: boolean;
  suppressTestTubeSupport?: boolean;
  forceCustomTestTubeSize?: boolean;
  customTestTubeDiameterMm?: number;
  customTestTubeHeightMm?: number;
  randomStyle?: RandomStyle;
  complexity?: ComplexityLevel;
  forceComplexity?: boolean;
  forceTexture?: boolean;
  params: VaseParameters;
}

export interface ImportedProductionVase {
  seed: number;
  params: VaseParameters;
  forceTestTubeSupport?: boolean;
  suppressTestTubeSupport?: boolean;
  forceCustomTestTubeSize?: boolean;
  customTestTubeDiameterMm?: number;
  customTestTubeHeightMm?: number;
  randomStyle?: RandomStyle;
  complexity?: ComplexityLevel;
  forceComplexity?: boolean;
  forceTexture?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Champ numerique invalide: ${key}`);
  }
  return value;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") {
    throw new Error(`Champ booleen invalide: ${key}`);
  }
  return value;
}

function readEnum<T extends readonly string[]>(
  source: Record<string, unknown>,
  key: string,
  allowed: T,
): T[number] {
  const value = source[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`Champ texte invalide: ${key}`);
  }
  return value;
}

function readOptionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  if (!(key in source)) return undefined;
  return readNumber(source, key);
}

function readOptionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  if (!(key in source)) return undefined;
  return readBoolean(source, key);
}

function readOptionalEnum<T extends readonly string[]>(
  source: Record<string, unknown>,
  key: string,
  allowed: T,
): T[number] | undefined {
  if (!(key in source)) return undefined;
  return readEnum(source, key, allowed);
}

function parseProfile(value: unknown): Profile {
  if (!isRecord(value)) {
    throw new Error("Profil invalide");
  }

  return {
    zRatio: readNumber(value, "zRatio"),
    diameter: readNumber(value, "diameter"),
    sides: readNumber(value, "sides"),
    rotationDeg: readNumber(value, "rotationDeg"),
    scaleX: readOptionalNumber(value, "scaleX") ?? 1,
    scaleY: readOptionalNumber(value, "scaleY") ?? 1,
    offsetX: readOptionalNumber(value, "offsetX") ?? 0,
    offsetY: readOptionalNumber(value, "offsetY") ?? 0,
  };
}

function parseParams(value: unknown): VaseParameters {
  if (!isRecord(value)) {
    throw new Error("Le JSON ne contient pas de parametres de vase.");
  }

  const profiles = value.profiles;
  if (!Array.isArray(profiles)) {
    throw new Error("La liste des profils est absente ou invalide.");
  }

  const params: VaseParameters = {
    heightMm: readNumber(value, "heightMm"),
    wallThicknessMm: readNumber(value, "wallThicknessMm"),
    bottomThicknessMm: readNumber(value, "bottomThicknessMm"),
    radialSamples: readNumber(value, "radialSamples"),
    verticalSamples: readNumber(value, "verticalSamples"),
    openTop: readBoolean(value, "openTop"),
    closeBottom: readBoolean(value, "closeBottom"),
    textureMode: readEnum(value, "textureMode", TEXTURE_MODES),
    textureType: readEnum(value, "textureType", TEXTURE_TYPES),
    textureZoom: readEnum(value, "textureZoom", TEXTURE_ZOOMS),
    textureType2: readEnum(value, "textureType2", TEXTURE_TYPES),
    textureZoom2: readEnum(value, "textureZoom2", TEXTURE_ZOOMS),
    scale: readNumber(value, "scale"),
    printSafeEngraving: readBoolean(value, "printSafeEngraving"),
    profiles: profiles.map(parseProfile),
  };

  validateParams(params);
  return params;
}

export function parseProductionVaseJson(content: string): ImportedProductionVase {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Le JSON importe n'est pas un objet.");
  }
  if (parsed.schema !== PRODUCTION_VASE_SCHEMA) {
    throw new Error("Ce fichier n'est pas un JSON de production Vaso compatible.");
  }

  return {
    seed: readNumber(parsed, "seed"),
    params: parseParams(parsed.params),
    forceTestTubeSupport: readOptionalBoolean(parsed, "forceTestTubeSupport"),
    suppressTestTubeSupport: readOptionalBoolean(parsed, "suppressTestTubeSupport"),
    forceCustomTestTubeSize: readOptionalBoolean(parsed, "forceCustomTestTubeSize"),
    customTestTubeDiameterMm: readOptionalNumber(parsed, "customTestTubeDiameterMm"),
    customTestTubeHeightMm: readOptionalNumber(parsed, "customTestTubeHeightMm"),
    randomStyle: readOptionalEnum(parsed, "randomStyle", RANDOM_STYLES),
    complexity: readOptionalEnum(parsed, "complexity", COMPLEXITY_LEVELS),
    forceComplexity: readOptionalBoolean(parsed, "forceComplexity"),
    forceTexture: readOptionalBoolean(parsed, "forceTexture"),
  };
}

export function buildProductionVaseJson(input: ImportedProductionVase): ProductionVaseJson {
  return {
    schema: PRODUCTION_VASE_SCHEMA,
    seed: input.seed,
    version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test",
    forceTestTubeSupport: input.forceTestTubeSupport,
    suppressTestTubeSupport: input.suppressTestTubeSupport,
    forceCustomTestTubeSize: input.forceCustomTestTubeSize,
    customTestTubeDiameterMm: input.customTestTubeDiameterMm,
    customTestTubeHeightMm: input.customTestTubeHeightMm,
    randomStyle: input.randomStyle,
    complexity: input.complexity,
    forceComplexity: input.forceComplexity,
    forceTexture: input.forceTexture,
    params: input.params,
  };
}

export function downloadProductionVaseJson(data: ProductionVaseJson): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vaso-production-${String(Math.trunc(data.seed)).padStart(8, "0")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
