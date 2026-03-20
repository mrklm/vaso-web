import { describe, it, expect } from "vitest";
import {
  regularPolygonVertices,
  resampleClosedContour,
  buildProfileContour,
  interpolateContours,
} from "./geometry";
import { createProfile } from "./types";

describe("regularPolygonVertices", () => {
  it("generates correct number of vertices for a square", () => {
    const profile = createProfile({ zRatio: 0, diameter: 100, sides: 4, rotationDeg: 0 });
    const verts = regularPolygonVertices(profile);
    expect(verts.length).toBe(8); // 4 vertices × 2 coords
  });

  it("generates correct number of vertices for a hexagon", () => {
    const profile = createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 });
    const verts = regularPolygonVertices(profile);
    expect(verts.length).toBe(12); // 6 × 2
  });

  it("places first vertex at radius distance along X", () => {
    const profile = createProfile({ zRatio: 0, diameter: 100, sides: 6, rotationDeg: 0 });
    const verts = regularPolygonVertices(profile);
    expect(verts[0]).toBeCloseTo(50, 5); // x = radius
    expect(verts[1]).toBeCloseTo(0, 5); // y = 0
  });

  it("respects rotation", () => {
    const profile = createProfile({ zRatio: 0, diameter: 100, sides: 4, rotationDeg: 45 });
    const verts = regularPolygonVertices(profile);
    // First vertex should be at 45° → x = r*cos(45°), y = r*sin(45°)
    const r = 50;
    expect(verts[0]).toBeCloseTo(r * Math.cos(Math.PI / 4), 5);
    expect(verts[1]).toBeCloseTo(r * Math.sin(Math.PI / 4), 5);
  });

  it("applies scaleX and scaleY", () => {
    const profile = createProfile({ zRatio: 0, diameter: 100, sides: 4, rotationDeg: 0 });
    profile.scaleX = 2;
    profile.scaleY = 0.5;
    const verts = regularPolygonVertices(profile);
    expect(verts[0]).toBeCloseTo(100, 5); // x = 50 * 2
    expect(verts[1]).toBeCloseTo(0, 5);
  });

  it("applies offset", () => {
    const profile = createProfile({ zRatio: 0, diameter: 100, sides: 4, rotationDeg: 0 });
    profile.offsetX = 10;
    profile.offsetY = -5;
    const verts = regularPolygonVertices(profile);
    expect(verts[0]).toBeCloseTo(60, 5); // 50 + 10
    expect(verts[1]).toBeCloseTo(-5, 5); // 0 + (-5)
  });
});

describe("resampleClosedContour", () => {
  it("resamples a triangle to desired number of points", () => {
    // Equilateral triangle
    const tri = new Float64Array([0, 1, -0.866, -0.5, 0.866, -0.5]);
    const resampled = resampleClosedContour(tri, 12);
    expect(resampled.length).toBe(24); // 12 × 2
  });

  it("throws for fewer than 3 points", () => {
    const pts = new Float64Array([0, 0, 1, 1]);
    expect(() => resampleClosedContour(pts, 10)).toThrow();
  });

  it("preserves approximate shape", () => {
    // Square centered at origin
    const sq = new Float64Array([1, 1, -1, 1, -1, -1, 1, -1]);
    const resampled = resampleClosedContour(sq, 8);
    // All points should be roughly at distance sqrt(2) or 1 from origin
    for (let i = 0; i < 8; i++) {
      const x = resampled[i * 2],
        y = resampled[i * 2 + 1];
      const dist = Math.sqrt(x * x + y * y);
      expect(dist).toBeGreaterThan(0.5);
      expect(dist).toBeLessThanOrEqual(Math.sqrt(2) + 0.01);
    }
  });
});

describe("buildProfileContour", () => {
  it("returns the correct number of samples", () => {
    const profile = createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 });
    const contour = buildProfileContour(profile, 48);
    expect(contour.length).toBe(96); // 48 × 2
  });
});

describe("interpolateContours", () => {
  it("returns c1 when t=0", () => {
    const c1 = new Float64Array([1, 2, 3, 4]);
    const c2 = new Float64Array([10, 20, 30, 40]);
    const result = interpolateContours(c1, c2, 0);
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(2);
  });

  it("returns c2 when t=1", () => {
    const c1 = new Float64Array([1, 2, 3, 4]);
    const c2 = new Float64Array([10, 20, 30, 40]);
    const result = interpolateContours(c1, c2, 1);
    expect(result[0]).toBeCloseTo(10);
    expect(result[3]).toBeCloseTo(40);
  });

  it("returns midpoint when t=0.5", () => {
    const c1 = new Float64Array([0, 0, 10, 10]);
    const c2 = new Float64Array([10, 10, 20, 20]);
    const result = interpolateContours(c1, c2, 0.5);
    expect(result[0]).toBeCloseTo(5);
    expect(result[2]).toBeCloseTo(15);
  });
});
