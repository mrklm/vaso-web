import { describe, it, expect } from "vitest";
import { generateVaseMesh, generateOuterProfilePoints, generateTopOuterContour } from "./mesh-builder";
import { countBoundaryEdges, countConnectedMeshComponents } from "./mesh-cleanup";
import { defaultVaseParameters, createProfile } from "./types";

describe("generateVaseMesh", () => {
  it("generates a valid mesh from default parameters", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    const mesh = generateVaseMesh(params);

    expect(mesh.vertices).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    // Indices should be in triplets
    expect(mesh.indices.length % 3).toBe(0);
  });

  it("generates vertices with valid coordinates (no NaN)", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    const mesh = generateVaseMesh(params);

    for (let i = 0; i < mesh.vertices.length; i++) {
      expect(Number.isFinite(mesh.vertices[i])).toBe(true);
    }
  });

  it("generates valid triangle indices", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    const mesh = generateVaseMesh(params);

    const maxVertIndex = mesh.vertices.length / 3 - 1;
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeLessThanOrEqual(maxVertIndex);
      expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("generates more geometry with higher resolution", () => {
    const lo = defaultVaseParameters();
    lo.radialSamples = 8;
    lo.verticalSamples = 4;
    const meshLo = generateVaseMesh(lo);

    const hi = defaultVaseParameters();
    hi.radialSamples = 32;
    hi.verticalSamples = 16;
    const meshHi = generateVaseMesh(hi);

    expect(meshHi.vertices.length).toBeGreaterThan(meshLo.vertices.length);
    expect(meshHi.indices.length).toBeGreaterThan(meshLo.indices.length);
  });

  it("works with multiple profiles", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    params.profiles = [
      createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 }),
      createProfile({ zRatio: 0.3, diameter: 100, sides: 8, rotationDeg: 15 }),
      createProfile({ zRatio: 0.7, diameter: 60, sides: 4, rotationDeg: 45 }),
      createProfile({ zRatio: 1, diameter: 50, sides: 6, rotationDeg: 30 }),
    ];
    const mesh = generateVaseMesh(params);
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it("generates a single closed component for a closed-bottom vase", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 32;
    params.verticalSamples = 16;
    params.closeBottom = true;

    const mesh = generateVaseMesh(params);

    expect(countConnectedMeshComponents(mesh)).toBe(1);
    expect(countBoundaryEdges(mesh)).toBe(0);
  });
});

describe("generateOuterProfilePoints", () => {
  it("returns z and radius arrays of the same length", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    const { zValues, radiusValues } = generateOuterProfilePoints(params, 50);
    expect(zValues.length).toBe(50);
    expect(radiusValues.length).toBe(50);
  });

  it("z values span from 0 to heightMm", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    const { zValues } = generateOuterProfilePoints(params, 50);
    expect(zValues[0]).toBeCloseTo(0);
    expect(zValues[49]).toBeCloseTo(params.heightMm);
  });

  it("radius values are all positive", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    const { radiusValues } = generateOuterProfilePoints(params, 50);
    for (let i = 0; i < radiusValues.length; i++) {
      expect(radiusValues[i]).toBeGreaterThan(0);
    }
  });
});

describe("generateTopOuterContour", () => {
  it("returns a flat array of xy pairs", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 24;
    params.verticalSamples = 8;
    const contour = generateTopOuterContour(params);
    expect(contour.length).toBe(48); // 24 × 2
  });
});
