import { describe, expect, it } from "vitest";
import { ShapeUtils, Vector2 } from "three";
import { formatEngravingLines } from "./engraving-text";
import { sanitizePlanarContour } from "./engraving-planar";

describe("engraving planar contour cleanup", () => {
  it("removes duplicated closure points and micro-segments before triangulation", () => {
    const contour = [
      new Vector2(0, 0),
      new Vector2(10, 0),
      new Vector2(10, 0.00001),
      new Vector2(10, 8),
      new Vector2(0, 8),
      new Vector2(0, 0),
    ];
    const hole = [
      new Vector2(3, 2),
      new Vector2(7, 2),
      new Vector2(7, 6),
      new Vector2(3, 6),
      new Vector2(3, 2),
    ];

    const sanitizedContour = sanitizePlanarContour(contour);
    const sanitizedHole = sanitizePlanarContour(hole);

    expect(sanitizedContour).toHaveLength(4);
    expect(sanitizedHole).toHaveLength(4);
    expect(sanitizedContour[0].equals(sanitizedContour[sanitizedContour.length - 1])).toBe(false);
    expect(sanitizedHole[0].equals(sanitizedHole[sanitizedHole.length - 1])).toBe(false);

    const triangles = ShapeUtils.triangulateShape(sanitizedContour, [sanitizedHole]);
    expect(triangles.length).toBeGreaterThan(0);
  });

  it("collapses fully colinear contours instead of handing degenerate rings to triangulation", () => {
    const contour = [
      new Vector2(28.75, 19.49),
      new Vector2(27.5, 21.65),
      new Vector2(26.25, 23.82),
      new Vector2(25, 25.98),
      new Vector2(23.75, 28.15),
      new Vector2(22.5, 30.31),
    ];

    const sanitizedContour = sanitizePlanarContour(contour, 1e-2);

    expect(sanitizedContour.length).toBeLessThan(3);
  });

  it("preserves smoothly curved contours that are not actually colinear", () => {
    const contour = Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return new Vector2(Math.cos(angle) * 40, Math.sin(angle) * 34.6);
    });

    const sanitizedContour = sanitizePlanarContour(contour, 1e-3);

    expect(sanitizedContour.length).toBe(24);
  });

  it("formats the engraved text with version on line 1 and a six-digit seed on line 2", () => {
    const [line1, line2] = formatEngravingLines(1234);

    expect(line1).toBe("VASO vtest");
    expect(line2).toBe("001234");
  });
});
