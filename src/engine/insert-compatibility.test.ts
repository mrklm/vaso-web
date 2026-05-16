import { describe, expect, it } from "vitest";
import { analyzeWaterproofInsertCompatibility } from "./insert-compatibility";
import { createProfile, defaultVaseParameters, type VaseParameters } from "./types";

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

describe("analyzeWaterproofInsertCompatibility", () => {
  it("returns Eco-Cup 50 cl for a tall and wide profile", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(180, 74, 96)).label).toBe("Eco-Cup 50 cl");
  });

  it("returns Eco-Cup 25 cl for a medium profile", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(145, 66, 84)).label).toBe("Eco-Cup 25 cl");
  });

  it("returns Eco-Cup 12,5 cl for a narrower compatible profile", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(112, 62, 74)).label).toBe("Eco-Cup 12,5 cl");
  });

  it("falls back to Tube à essai when the neck is too narrow for cups", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(120, 40, 30)).label).toBe(
      "Tube à essai 75 × 20 mm",
    );
  });

  it("accepts a profile just above the 12,5 cl dimensions with margin", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(101.2, 57.9, 71.9)).label).toBe(
      "Eco-Cup 12,5 cl",
    );
  });

  it("falls back below the 12,5 cl limit with margins applied", () => {
    expect(analyzeWaterproofInsertCompatibility(createTwoProfileVase(100.8, 57.6, 71.5)).label).toBe(
      "Tube à essai 75 × 20 mm",
    );
  });
});
