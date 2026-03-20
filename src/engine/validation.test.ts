import { describe, it, expect } from "vitest";
import { validateParams, ValidationError } from "./validation";
import { defaultVaseParameters, createProfile } from "./types";

describe("validateParams", () => {
  it("accepts valid default parameters", () => {
    expect(() => validateParams(defaultVaseParameters())).not.toThrow();
  });

  it("rejects fewer than 2 profiles", () => {
    const params = defaultVaseParameters();
    params.profiles = [createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 })];
    expect(() => validateParams(params)).toThrow(ValidationError);
  });

  it("rejects zero height", () => {
    const params = defaultVaseParameters();
    params.heightMm = 0;
    expect(() => validateParams(params)).toThrow(ValidationError);
  });

  it("rejects negative wall thickness", () => {
    const params = defaultVaseParameters();
    params.wallThicknessMm = -1;
    expect(() => validateParams(params)).toThrow(ValidationError);
  });

  it("rejects too few radial samples", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 3;
    expect(() => validateParams(params)).toThrow(ValidationError);
  });

  it("rejects diameter smaller than 2x wall thickness", () => {
    const params = defaultVaseParameters();
    params.wallThicknessMm = 5;
    params.profiles = [
      createProfile({ zRatio: 0, diameter: 8, sides: 6, rotationDeg: 0 }),
      createProfile({ zRatio: 1, diameter: 8, sides: 6, rotationDeg: 0 }),
    ];
    expect(() => validateParams(params)).toThrow(ValidationError);
  });

  it("rejects profile with fewer than 3 sides", () => {
    const params = defaultVaseParameters();
    params.profiles[0].sides = 2;
    expect(() => validateParams(params)).toThrow(ValidationError);
  });

  it("rejects z_ratio out of bounds", () => {
    const params = defaultVaseParameters();
    params.profiles[0].zRatio = -0.1;
    expect(() => validateParams(params)).toThrow(ValidationError);
  });
});
