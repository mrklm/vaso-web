import { describe, it, expect } from "vitest";
import {
  maxSupportlessRadialStep,
  limitContourStepFromPrevious,
  computeInnerContour,
} from "./constraints";

describe("maxSupportlessRadialStep", () => {
  it("returns minimum 0.25 for tiny dz", () => {
    expect(maxSupportlessRadialStep(0)).toBe(0.25);
    expect(maxSupportlessRadialStep(0.001)).toBeCloseTo(0.25);
  });

  it("increases with dz", () => {
    const s1 = maxSupportlessRadialStep(1);
    const s2 = maxSupportlessRadialStep(2);
    expect(s2).toBeGreaterThan(s1);
  });

  it("uses 42° overhang angle", () => {
    const dz = 10;
    const expected = dz * Math.tan((42 * Math.PI) / 180);
    expect(maxSupportlessRadialStep(dz)).toBeCloseTo(expected);
  });
});

describe("limitContourStepFromPrevious", () => {
  it("does not change contour within max step", () => {
    const prev = new Float64Array([10, 0, 0, 10, -10, 0, 0, -10]);
    const curr = new Float64Array([10.5, 0, 0, 10.5, -10.5, 0, 0, -10.5]);
    const result = limitContourStepFromPrevious(prev, curr, 5, 2);

    // Should be unchanged since step is small
    for (let i = 0; i < curr.length; i++) {
      expect(result[i]).toBeCloseTo(curr[i], 3);
    }
  });

  it("clamps contour that exceeds max step", () => {
    const prev = new Float64Array([10, 0, 0, 10]);
    const curr = new Float64Array([20, 0, 0, 20]); // Jump of 10
    const result = limitContourStepFromPrevious(prev, curr, 2, 1); // Max step = 2

    // Radius should be clamped to prev + maxStep = 12
    const r0 = Math.sqrt(result[0] ** 2 + result[1] ** 2);
    expect(r0).toBeCloseTo(12, 3);
  });
});

describe("computeInnerContour", () => {
  it("reduces radius by wall thickness", () => {
    const outer = new Float64Array([20, 0, 0, 20, -20, 0, 0, -20]);
    const inner = computeInnerContour(outer, 3);

    const outerR = Math.sqrt(outer[0] ** 2 + outer[1] ** 2);
    const innerR = Math.sqrt(inner[0] ** 2 + inner[1] ** 2);
    expect(innerR).toBeCloseTo(outerR - 3, 5);
  });

  it("throws when radius is too small for wall thickness", () => {
    const outer = new Float64Array([2, 0, 0, 2]);
    expect(() => computeInnerContour(outer, 3)).toThrow();
  });
});
