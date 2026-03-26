import { describe, it, expect } from "vitest";
import {
  maxSupportlessRadialStep,
  limitContourStepFromPrevious,
  computeInnerContour,
} from "./constraints";

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return Math.hypot(px - qx, py - qy);
}

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
  it("keeps a constant distance from a diamond contour", () => {
    const outer = new Float64Array([20, 0, 0, 20, -20, 0, 0, -20]);
    const inner = computeInnerContour(outer, 3);

    for (let i = 0; i < inner.length / 2; i++) {
      const px = inner[i * 2];
      const py = inner[i * 2 + 1];
      let minDistance = Number.POSITIVE_INFINITY;

      for (let edge = 0; edge < outer.length / 2; edge++) {
        const next = (edge + 1) % (outer.length / 2);
        const d = distancePointToSegment(
          px,
          py,
          outer[edge * 2],
          outer[edge * 2 + 1],
          outer[next * 2],
          outer[next * 2 + 1],
        );
        minDistance = Math.min(minDistance, d);
      }

      expect(minDistance).toBeCloseTo(3, 5);
    }
  });

  it("throws when radius is too small for wall thickness", () => {
    const outer = new Float64Array([2, 0, 0, 2]);
    expect(() => computeInnerContour(outer, 3)).toThrow();
  });

  it("keeps a constant distance from flat faces on an elongated rectangle", () => {
    const outer = new Float64Array([-20, -8, 20, -8, 20, 8, -20, 8]);
    const inner = computeInnerContour(outer, 3);

    const expected = new Float64Array([-17, -5, 17, -5, 17, 5, -17, 5]);
    for (let i = 0; i < inner.length; i++) {
      expect(inner[i]).toBeCloseTo(expected[i], 5);
    }

    for (let i = 0; i < inner.length / 2; i++) {
      const px = inner[i * 2];
      const py = inner[i * 2 + 1];
      let minDistance = Number.POSITIVE_INFINITY;

      for (let edge = 0; edge < outer.length / 2; edge++) {
        const next = (edge + 1) % (outer.length / 2);
        const d = distancePointToSegment(
          px,
          py,
          outer[edge * 2],
          outer[edge * 2 + 1],
          outer[next * 2],
          outer[next * 2 + 1],
        );
        minDistance = Math.min(minDistance, d);
      }

      expect(minDistance).toBeCloseTo(3, 5);
    }
  });
});
