import { describe, it, expect } from "vitest";
import { applySingleTexture, applyTexture } from "./textures";
import { defaultVaseParameters, type TextureType } from "./types";
import { buildProfileContour } from "./geometry";
import { createProfile } from "./types";

function makeContour(samples = 24): Float64Array {
  const profile = createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 });
  return buildProfileContour(profile, samples);
}

describe("applySingleTexture", () => {
  const allTextures: TextureType[] = [
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

  it.each(allTextures)('applies "%s" without NaN', (textureType) => {
    const contour = makeContour();
    const params = defaultVaseParameters();
    const result = applySingleTexture(contour, 90, textureType, "Moyen", params);

    expect(result.length).toBe(contour.length);
    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i])).toBe(true);
    }
  });

  it('returns contour unchanged for "Aucune"', () => {
    const contour = makeContour();
    const params = defaultVaseParameters();
    const result = applySingleTexture(contour, 90, "Aucune", "Moyen", params);
    expect(result).toBe(contour); // Same reference
  });

  it("modifies contour for non-trivial textures", () => {
    const contour = makeContour();
    const params = defaultVaseParameters();
    const result = applySingleTexture(contour, 90, "Cannelures", "Moyen", params);

    // At least some points should differ
    let hasDiff = false;
    for (let i = 0; i < contour.length; i++) {
      if (Math.abs(result[i] - contour[i]) > 0.001) {
        hasDiff = true;
        break;
      }
    }
    expect(hasDiff).toBe(true);
  });
});

describe("applyTexture", () => {
  it('returns contour unchanged when mode is "Pas de texture"', () => {
    const contour = makeContour();
    const params = defaultVaseParameters();
    params.textureMode = "Pas de texture";
    const result = applyTexture(contour, 90, params);
    expect(result).toBe(contour);
  });

  it('applies texture when mode is "Texture imposée"', () => {
    const contour = makeContour();
    const params = defaultVaseParameters();
    params.textureMode = "Texture imposée";
    params.textureType = "Spirale";
    params.textureZoom = "Gros";
    const result = applyTexture(contour, 90, params);

    let hasDiff = false;
    for (let i = 0; i < contour.length; i++) {
      if (Math.abs(result[i] - contour[i]) > 0.001) {
        hasDiff = true;
        break;
      }
    }
    expect(hasDiff).toBe(true);
  });

  it("applies double texture as average of two", () => {
    const contour = makeContour();
    const params = defaultVaseParameters();
    params.textureMode = "Double texture";
    params.textureType = "Cannelures";
    params.textureZoom = "Moyen";
    params.textureType2 = "Anneaux";
    params.textureZoom2 = "Gros";
    const result = applyTexture(contour, 90, params);

    expect(result.length).toBe(contour.length);
    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i])).toBe(true);
    }
  });
});
