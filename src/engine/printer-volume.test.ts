import { describe, expect, it } from "vitest";
import { clampParamsToBuildVolume, computeVaseEnvelopeMm, validateParamsAgainstBuildVolume } from "./printer-volume";
import { defaultVaseParameters } from "./types";
import { ValidationError } from "./validation";

describe("printer volume constraints", () => {
  it("clamps vase height and profile diameters to the selected printer volume", () => {
    const params = defaultVaseParameters();
    params.heightMm = 320;
    params.profiles[0].diameter = 260;
    params.profiles[1].diameter = 240;

    const clamped = clampParamsToBuildVolume(params, { width: 180, depth: 200, height: 180 });

    expect(clamped.heightMm).toBe(180);
    expect(clamped.profiles[0].diameter).toBe(180);
    expect(clamped.profiles[1].diameter).toBe(180);
  });

  it("computes the vase envelope from profile contours", () => {
    const params = defaultVaseParameters();
    params.heightMm = 210;
    params.profiles[0].diameter = 120;
    params.profiles[1].diameter = 80;

    const envelope = computeVaseEnvelopeMm(params);

    expect(envelope.height).toBe(210);
    expect(envelope.width).toBeLessThanOrEqual(120.1);
    expect(envelope.depth).toBeLessThanOrEqual(120.1);
  });

  it("rejects params that exceed the selected printer build volume", () => {
    const params = defaultVaseParameters();
    params.heightMm = 250;

    expect(() =>
      validateParamsAgainstBuildVolume(params, { width: 220, depth: 220, height: 180 }),
    ).toThrow(ValidationError);
  });
});
