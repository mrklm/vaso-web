import type { VaseParameters } from "../engine/types";
import { createProfile } from "../engine/types";

export interface Preset {
  name: string;
  description: string;
  params: VaseParameters;
}

const base: Omit<VaseParameters, "profiles"> = {
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
};

export const PRESETS: Preset[] = [
  {
    name: "Classique",
    description: "Vase simple et élégant",
    params: {
      ...base,
      profiles: [
        createProfile({ zRatio: 0, diameter: 60, sides: 8, rotationDeg: 0 }),
        createProfile({ zRatio: 0.3, diameter: 90, sides: 8, rotationDeg: 0 }),
        createProfile({ zRatio: 1, diameter: 65, sides: 8, rotationDeg: 0 }),
      ],
    },
  },
  {
    name: "Torsadé",
    description: "Rotation progressive des profils",
    params: {
      ...base,
      profiles: [
        createProfile({ zRatio: 0, diameter: 70, sides: 5, rotationDeg: 0 }),
        createProfile({ zRatio: 0.5, diameter: 85, sides: 5, rotationDeg: 36 }),
        createProfile({ zRatio: 1, diameter: 55, sides: 5, rotationDeg: 72 }),
      ],
    },
  },
  {
    name: "Bulbeux",
    description: "Forme ronde et généreuse",
    params: {
      ...base,
      heightMm: 150,
      profiles: [
        createProfile({ zRatio: 0, diameter: 50, sides: 10, rotationDeg: 0 }),
        createProfile({ zRatio: 0.4, diameter: 120, sides: 10, rotationDeg: 0 }),
        createProfile({ zRatio: 0.7, diameter: 100, sides: 10, rotationDeg: 0 }),
        createProfile({ zRatio: 1, diameter: 45, sides: 10, rotationDeg: 0 }),
      ],
    },
  },
  {
    name: "Tour",
    description: "Haute et fine, architecturale",
    params: {
      ...base,
      heightMm: 250,
      profiles: [
        createProfile({ zRatio: 0, diameter: 80, sides: 4, rotationDeg: 0 }),
        createProfile({ zRatio: 0.5, diameter: 60, sides: 4, rotationDeg: 22 }),
        createProfile({ zRatio: 1, diameter: 50, sides: 4, rotationDeg: 45 }),
      ],
    },
  },
  {
    name: "Organique",
    description: "Formes douces et naturelles",
    params: {
      ...base,
      textureMode: "Texture imposée",
      textureType: "Vagues",
      textureZoom: "Gros",
      profiles: [
        createProfile({ zRatio: 0, diameter: 55, sides: 7, rotationDeg: 0 }),
        createProfile({ zRatio: 0.2, diameter: 80, sides: 7, rotationDeg: 5 }),
        createProfile({ zRatio: 0.5, diameter: 95, sides: 7, rotationDeg: 12 }),
        createProfile({ zRatio: 0.8, diameter: 70, sides: 7, rotationDeg: 8 }),
        createProfile({ zRatio: 1, diameter: 60, sides: 7, rotationDeg: 0 }),
      ],
    },
  },
  {
    name: "Diamant",
    description: "Texture diamant sur forme effilée",
    params: {
      ...base,
      textureMode: "Texture imposée",
      textureType: "Diamants",
      textureZoom: "Moyen",
      profiles: [
        createProfile({ zRatio: 0, diameter: 70, sides: 6, rotationDeg: 0 }),
        createProfile({ zRatio: 0.4, diameter: 100, sides: 6, rotationDeg: 15 }),
        createProfile({ zRatio: 1, diameter: 50, sides: 6, rotationDeg: 30 }),
      ],
    },
  },
  {
    name: "Hexagonal",
    description: "Motif hexagonal sur hexagone",
    params: {
      ...base,
      textureMode: "Texture imposée",
      textureType: "Hexagones",
      textureZoom: "Gros",
      profiles: [
        createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 }),
        createProfile({ zRatio: 1, diameter: 80, sides: 6, rotationDeg: 0 }),
      ],
    },
  },
  {
    name: "Amphore",
    description: "Forme classique gréco-romaine",
    params: {
      ...base,
      heightMm: 220,
      profiles: [
        createProfile({ zRatio: 0, diameter: 50, sides: 12, rotationDeg: 0 }),
        createProfile({ zRatio: 0.15, diameter: 90, sides: 12, rotationDeg: 0 }),
        createProfile({ zRatio: 0.4, diameter: 110, sides: 12, rotationDeg: 0 }),
        createProfile({ zRatio: 0.65, diameter: 70, sides: 12, rotationDeg: 0 }),
        createProfile({ zRatio: 0.85, diameter: 55, sides: 12, rotationDeg: 0 }),
        createProfile({ zRatio: 1, diameter: 65, sides: 12, rotationDeg: 0 }),
      ],
    },
  },
];
