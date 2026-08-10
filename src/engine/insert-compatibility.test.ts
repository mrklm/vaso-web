import { describe, expect, it } from "vitest";
import { analyzeWaterproofInsertCompatibility } from "./insert-compatibility";
import {
  createProfile,
  defaultVaseParameters,
  TEXTURE_TYPES,
  type TextureType,
  type VaseParameters,
} from "./types";

function createTwoProfileVase(
  heightMm: number,
  bottomOuterDiameterMm: number,
  topOuterDiameterMm: number,
): VaseParameters {
  const params = defaultVaseParameters();
  params.heightMm = heightMm;
  params.wallThicknessMm = 2.4;
  params.bottomThicknessMm = 3;
  params.radialSamples = 96;
  params.profiles = [
    createProfile({ zRatio: 0, diameter: bottomOuterDiameterMm, sides: 64, rotationDeg: 0 }),
    createProfile({ zRatio: 1, diameter: topOuterDiameterMm, sides: 64, rotationDeg: 0 }),
  ];
  return params;
}

function withImposedTexture(params: VaseParameters, textureType: TextureType): VaseParameters {
  return {
    ...params,
    textureMode: "Texture imposée",
    textureType,
    textureZoom: "Énorme",
  };
}

describe("analyzeWaterproofInsertCompatibility", () => {
  it("returns Eco-Cup 50 cl for a tall and wide profile", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(180, 74, 96)).label).toBe(
      "Eco-Cup 50 cl",
    );
  });

  it("returns Eco-Cup 25 cl for a medium profile", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(145, 66, 84)).label).toBe(
      "Eco-Cup 25 cl",
    );
  });

  it("returns Eco-Cup 12,5 cl for a narrower compatible profile", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(112, 62, 74)).label).toBe(
      "Eco-Cup 12,5 cl",
    );
  });

  it("falls back to Tube à essai when the neck is too narrow for cups", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(125, 50, 42)).label).toBe(
      "Tube à essai 100 × 25,4 mm",
    );
  });

  it("uses the 120 mm test tube from 140 mm vase height", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(140, 52, 42)).label).toBe(
      "Tube à essai 120 × 25,4 mm",
    );
  });

  it("accepts a profile just above the 12,5 cl dimensions with margin", () => {
    expect(
      analyzeWaterproofInsertCompatibility(createTwoProfileVase(101.2, 57.9, 71.9)).label,
    ).toBe("Eco-Cup 12,5 cl");
  });

  it("rejects an Eco-Cup 12,5 cl profile that only matches the cup dimensions without clearance", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(98, 54.8, 68.8)).label).toBe(
      "Aucun contenant compatible",
    );
  });

  it("requires clearance around the Eco-Cup 50 cl opening", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(169, 71.8, 91.8)).label).toBe(
      "Eco-Cup 25 cl",
    );
  });

  it("falls back below the 12,5 cl limit with margins applied", () => {
    expect(
      analyzeWaterproofInsertCompatibility(createTwoProfileVase(100.8, 57.6, 71.5)).label,
    ).toBe("Aucun contenant compatible");
  });

  it("accounts for inward Anneaux texture when checking available width", () => {
    const smoothParams = createTwoProfileVase(180, 74, 96);
    const texturedParams = withImposedTexture(smoothParams, "Anneaux");

    expect(analyzeWaterproofInsertCompatibility(smoothParams).label).toBe("Eco-Cup 50 cl");
    expect(analyzeWaterproofInsertCompatibility(texturedParams).label).not.toBe("Eco-Cup 50 cl");
  });

  it.each(TEXTURE_TYPES.filter((textureType) => textureType !== "Aucune"))(
    "checks insert compatibility against the real %s texture",
    (textureType) => {
      const params = withImposedTexture(createTwoProfileVase(140, 52, 42), textureType);
      const compatibility = analyzeWaterproofInsertCompatibility(params);

      expect(["eco_cup", "test_tube", "none"]).toContain(compatibility.type);
      expect(compatibility.label.length).toBeGreaterThan(0);
    },
  );
});
