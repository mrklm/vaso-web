import { create } from "zustand";
import { temporal } from "zundo";
import { clampParamsToBuildVolume, type BuildVolume } from "../engine/printer-volume";
import type {
  VaseParameters,
  Profile,
  TextureMode,
  TextureType,
  TextureZoom,
  RandomStyle,
  ComplexityLevel,
} from "../engine/types";
import { defaultVaseParameters, createProfile } from "../engine/types";
import { useUIStore } from "./ui-store";

interface VaseState {
  params: VaseParameters;
  seed: number;
  isSeedModified: boolean;
  randomStyle: RandomStyle;
  complexity: ComplexityLevel;
  forceComplexity: boolean;
  forceTexture: boolean;

  setHeight: (v: number) => void;
  setWallThickness: (v: number) => void;
  setBottomThickness: (v: number) => void;
  setRadialSamples: (v: number) => void;
  setVerticalSamples: (v: number) => void;
  setProfileCount: (count: number) => void;
  updateProfile: (index: number, partial: Partial<Profile>) => void;
  toggleProfile: (index: number, enabled: boolean) => void;
  setTextureMode: (mode: TextureMode) => void;
  setTextureType: (t: TextureType) => void;
  setTextureZoom: (z: TextureZoom) => void;
  setTextureType2: (t: TextureType) => void;
  setTextureZoom2: (z: TextureZoom) => void;
  setSeed: (seed: number) => void;
  setRandomStyle: (style: RandomStyle) => void;
  setComplexity: (level: ComplexityLevel) => void;
  setForceComplexity: (v: boolean) => void;
  setForceTexture: (v: boolean) => void;
  setParams: (params: VaseParameters) => void;
  randomize: () => void;
  applySeed: () => void;
}

// Seedable PRNG (simple mulberry32)
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function triangular(rng: () => number, low: number, high: number, mode: number): number {
  const u = rng();
  const fc = (mode - low) / (high - low);
  if (u < fc) {
    return low + Math.sqrt(u * (high - low) * (mode - low));
  }
  return high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

function randomizeParams(
  seed: number,
  style: RandomStyle,
  complexity: ComplexityLevel,
  forceComplexity: boolean,
  forceTexture: boolean,
  currentParams: VaseParameters,
): VaseParameters {
  const rng = mulberry32(seed);

  // Determine profile count based on complexity
  let profileCount: number;
  const actualComplexity = forceComplexity
    ? complexity
    : (["Sobre", "Moyen", "Complexe"] as const)[Math.floor(rng() * 3)];

  switch (actualComplexity) {
    case "Sobre":
      profileCount = 2 + Math.floor(rng() * 2);
      break; // 2-3
    case "Moyen":
      profileCount = 3 + Math.floor(rng() * 4);
      break; // 3-6
    case "Complexe":
      profileCount = 5 + Math.floor(rng() * 6);
      break; // 5-10
    default:
      profileCount = 3 + Math.floor(rng() * 5);
  }
  profileCount = Math.min(10, Math.max(2, profileCount));

  // Style-specific parameter ranges
  let diaMin = 40,
    diaMax = 140,
    diaMode = 80;
  let sidesMin = 3,
    sidesMax = 10;
  let rotMin = 0,
    rotMax = 60;
  let heightMin = 100,
    heightMax = 250;

  switch (style) {
    case "Soft":
      diaMin = 50;
      diaMax = 120;
      diaMode = 80;
      sidesMin = 6;
      sidesMax = 10;
      rotMin = 0;
      rotMax = 15;
      break;
    case "Raw":
      diaMin = 40;
      diaMax = 130;
      diaMode = 70;
      sidesMin = 3;
      sidesMax = 6;
      rotMin = 0;
      rotMax = 90;
      break;
    case "Twisted":
      diaMin = 50;
      diaMax = 110;
      diaMode = 75;
      sidesMin = 4;
      sidesMax = 8;
      rotMin = 20;
      rotMax = 120;
      break;
    case "Architectural":
      diaMin = 60;
      diaMax = 140;
      diaMode = 100;
      sidesMin = 4;
      sidesMax = 6;
      rotMin = 0;
      rotMax = 45;
      heightMin = 150;
      heightMax = 250;
      break;
    case "Organic":
      diaMin = 40;
      diaMax = 120;
      diaMode = 70;
      sidesMin = 5;
      sidesMax = 10;
      rotMin = 0;
      rotMax = 30;
      break;
    case "Tapered":
      diaMin = 60;
      diaMax = 130;
      diaMode = 100;
      sidesMin = 4;
      sidesMax = 8;
      rotMin = 0;
      rotMax = 20;
      break;
    case "Bulbous":
      diaMin = 50;
      diaMax = 140;
      diaMode = 100;
      sidesMin = 5;
      sidesMax = 10;
      rotMin = 0;
      rotMax = 30;
      break;
    case "Pure Random":
      diaMin = 30;
      diaMax = 150;
      diaMode = 80;
      sidesMin = 3;
      sidesMax = 100;
      rotMin = 0;
      rotMax = 180;
      break;
  }

  const height = triangular(rng, heightMin, heightMax, (heightMin + heightMax) / 2);

  // Generate profiles
  const profiles: Profile[] = [];
  for (let i = 0; i < profileCount; i++) {
    const zRatio =
      i === 0 ? 0 : i === profileCount - 1 ? 1 : i / (profileCount - 1) + (rng() - 0.5) * 0.1;
    let diameter = triangular(rng, diaMin, diaMax, diaMode);

    // Tapered: decrease toward top
    if (style === "Tapered") diameter *= 1 - zRatio * 0.5;
    // Bulbous: bigger in middle
    if (style === "Bulbous") diameter *= 0.7 + 0.6 * Math.sin(Math.PI * zRatio);

    const sides = sidesMin + Math.floor(rng() * (sidesMax - sidesMin + 1));
    const rotation = triangular(rng, rotMin, rotMax, (rotMin + rotMax) / 2);

    profiles.push(
      createProfile({
        zRatio: Math.max(0, Math.min(1, zRatio)),
        diameter: Math.max(currentParams.wallThicknessMm * 2 + 2, diameter),
        sides,
        rotationDeg: rotation,
      }),
    );
  }

  // Sort and fix endpoints
  profiles.sort((a, b) => a.zRatio - b.zRatio);
  profiles[0].zRatio = 0;
  profiles[profiles.length - 1].zRatio = 1;

  // Texture
  let textureMode = currentParams.textureMode;
  let textureType = currentParams.textureType;
  let textureZoom = currentParams.textureZoom;

  if (!forceTexture) {
    const textureRoll = rng();
    if (textureRoll < 0.3) {
      textureMode = "Pas de texture";
    } else {
      textureMode = "Texture aléatoire";
      const textureOptions: TextureType[] = [
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
      ];
      textureType = textureOptions[Math.floor(rng() * textureOptions.length)];
      const zoomOptions: TextureZoom[] = [
        "Très fin",
        "Fin",
        "Moyen",
        "Gros",
        "Très gros",
        "Énorme",
      ];
      textureZoom = zoomOptions[Math.floor(rng() * zoomOptions.length)];
    }
  }

  return {
    ...currentParams,
    heightMm: Math.round(height),
    profiles,
    textureMode,
    textureType,
    textureZoom,
  };
}

function getActiveBuildVolume(): BuildVolume {
  const { printerProfiles, activePrinterProfile } = useUIStore.getState();
  const activeProfile = printerProfiles.find((profile) => profile.name === activePrinterProfile) ?? printerProfiles[0];
  return {
    width: activeProfile?.width ?? 220,
    depth: activeProfile?.depth ?? 220,
    height: activeProfile?.height ?? 250,
  };
}

function constrainToActiveBuildVolume(params: VaseParameters): VaseParameters {
  if (!useUIStore.getState().enforcePrinterVolume) {
    return params;
  }
  return clampParamsToBuildVolume(params, getActiveBuildVolume());
}

export const useVaseStore = create<VaseState>()(temporal((set, get) => ({
  params: defaultVaseParameters(),
  seed: Math.floor(Math.random() * 999999),
  isSeedModified: false,
  randomStyle: "Soft",
  complexity: "Moyen",
  forceComplexity: false,
  forceTexture: false,

  setHeight: (v) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, heightMm: v }), isSeedModified: true })),
  setWallThickness: (v) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, wallThicknessMm: v }), isSeedModified: true })),
  setBottomThickness: (v) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, bottomThicknessMm: v }), isSeedModified: true })),
  setRadialSamples: (v) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, radialSamples: v }), isSeedModified: true })),
  setVerticalSamples: (v) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, verticalSamples: v }), isSeedModified: true })),

  setProfileCount: (count) =>
    set((s) => {
      const current = s.params.profiles;
      if (count <= current.length) {
        return {
          params: constrainToActiveBuildVolume({ ...s.params, profiles: current.slice(0, count) }),
          isSeedModified: true,
        };
      }
      const newProfiles = [...current];
      for (let i = current.length; i < count; i++) {
        newProfiles.push(
          createProfile({
            zRatio: i / (count - 1),
            diameter: 60,
            sides: 6,
            rotationDeg: 0,
          }),
        );
      }
      // Ensure first=0, last=1
      newProfiles[0].zRatio = 0;
      newProfiles[newProfiles.length - 1].zRatio = 1;
      return { params: constrainToActiveBuildVolume({ ...s.params, profiles: newProfiles }), isSeedModified: true };
    }),

  updateProfile: (index, partial) =>
    set((s) => {
      const profiles = s.params.profiles.map((p, i) => (i === index ? { ...p, ...partial } : p));
      return { params: constrainToActiveBuildVolume({ ...s.params, profiles }), isSeedModified: true };
    }),

  toggleProfile: (_index, _enabled) => {
    // In web version, we just adjust profile count
  },

  setTextureMode: (mode) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, textureMode: mode }), isSeedModified: true })),
  setTextureType: (t) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, textureType: t }), isSeedModified: true })),
  setTextureZoom: (z) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, textureZoom: z }), isSeedModified: true })),
  setTextureType2: (t) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, textureType2: t }), isSeedModified: true })),
  setTextureZoom2: (z) =>
    set((s) => ({ params: constrainToActiveBuildVolume({ ...s.params, textureZoom2: z }), isSeedModified: true })),
  setSeed: (seed) => set({ seed }),
  setRandomStyle: (style) => set({ randomStyle: style }),
  setComplexity: (level) => set({ complexity: level }),
  setForceComplexity: (v) => set({ forceComplexity: v }),
  setForceTexture: (v) => set({ forceTexture: v }),
  setParams: (params) => set({ params: constrainToActiveBuildVolume(params), isSeedModified: true }),

  applySeed: () => {
    const state = get();
    const params = randomizeParams(
      state.seed,
      state.randomStyle,
      state.complexity,
      state.forceComplexity,
      state.forceTexture,
      state.params,
    );
    set({ params: constrainToActiveBuildVolume(params), isSeedModified: false });
  },

  randomize: () => {
    const state = get();
    const newSeed = Math.floor(Math.random() * 999999);
    const params = randomizeParams(
      newSeed,
      state.randomStyle,
      state.complexity,
      state.forceComplexity,
      state.forceTexture,
      state.params,
    );
    set({ params: constrainToActiveBuildVolume(params), seed: newSeed, isSeedModified: false });
  },
}), {
  limit: 50,
  equality: (a, b) =>
    JSON.stringify(a.params) === JSON.stringify(b.params) &&
    a.seed === b.seed &&
    a.isSeedModified === b.isSeedModified,
}));
