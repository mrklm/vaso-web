import { describe, it, expect } from "vitest";
import {
  generateVaseMesh,
  generateOuterProfilePoints,
  generateTopOuterContour,
} from "./mesh-builder";
import { countBoundaryEdges, countConnectedMeshComponents } from "./mesh-cleanup";
import { defaultVaseParameters, createProfile, type VaseParameters } from "./types";

function createTwoProfileVase(
  heightMm: number,
  bottomOuterDiameterMm: number,
  topOuterDiameterMm: number,
): VaseParameters {
  const params = defaultVaseParameters();
  params.heightMm = heightMm;
  params.wallThicknessMm = 2.4;
  params.bottomThicknessMm = 3;
  params.radialSamples = 48;
  params.verticalSamples = 32;
  params.profiles = [
    createProfile({ zRatio: 0, diameter: bottomOuterDiameterMm, sides: 64, rotationDeg: 0 }),
    createProfile({ zRatio: 1, diameter: topOuterDiameterMm, sides: 64, rotationDeg: 0 }),
  ];
  return params;
}

function hasTestTubeSupportVertices(mesh: ReturnType<typeof generateVaseMesh>): boolean {
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    const x = mesh.vertices[index];
    const y = mesh.vertices[index + 1];
    const z = mesh.vertices[index + 2];
    const radius = Math.hypot(x, y);
    if (radius >= 6.8 && radius <= 9.1 && z > 4) {
      return true;
    }
  }

  return false;
}

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
    const params = createTwoProfileVase(180, 74, 96);
    params.radialSamples = 32;
    params.verticalSamples = 16;
    params.closeBottom = true;

    const mesh = generateVaseMesh(params);

    expect(countConnectedMeshComponents(mesh)).toBe(1);
    expect(countBoundaryEdges(mesh)).toBe(0);
  });

  it("keeps Eco-Cup-compatible vases free of tube support geometry", () => {
    const params = createTwoProfileVase(180, 74, 96);
    const mesh = generateVaseMesh(params);

    expect(hasTestTubeSupportVertices(mesh)).toBe(false);
    expect(countBoundaryEdges(mesh)).toBe(0);
  });

  it("adds a closed minimal support when only a test tube fits", () => {
    const params = createTwoProfileVase(120, 40, 30);
    const mesh = generateVaseMesh(params);

    expect(hasTestTubeSupportVertices(mesh)).toBe(true);
    expect(countBoundaryEdges(mesh)).toBe(0);
  });

  it("aligns inner and outer wall layers on the same body z slices", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 16;
    params.verticalSamples = 8;
    params.bottomThicknessMm = 3;

    const mesh = generateVaseMesh(params);
    const countsByZ = new Map<number, number>();
    for (let i = 2; i < mesh.vertices.length; i += 3) {
      const z = Math.round(mesh.vertices[i] * 1e6) / 1e6;
      countsByZ.set(z, (countsByZ.get(z) ?? 0) + 1);
    }

    expect(countsByZ.get(0)).toBe(params.radialSamples + 1);
    expect(countsByZ.get(3)).toBe(params.radialSamples + 1);

    const sharedBodyLayers = [...countsByZ.entries()].filter(
      ([z, count]) =>
        z > params.bottomThicknessMm && z <= params.heightMm && count === params.radialSamples * 2,
    );
    expect(sharedBodyLayers.length).toBe(params.verticalSamples - 1);
  });

  it("keeps a single seam line on round textured vases", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 96;
    params.verticalSamples = 24;
    params.textureMode = "Texture imposée";
    params.textureType = "Vagues";
    params.textureZoom = "Gros";
    params.profiles = [
      createProfile({ zRatio: 0, diameter: 80, sides: 48, rotationDeg: 0 }),
      createProfile({ zRatio: 1, diameter: 80, sides: 48, rotationDeg: 0 }),
    ];

    const mesh = generateVaseMesh(params);
    const seamAngles: number[] = [];
    for (let layer = 0; layer < params.verticalSamples; layer++) {
      const vertexOffset = layer * params.radialSamples * 3;
      seamAngles.push(Math.atan2(mesh.vertices[vertexOffset + 1], mesh.vertices[vertexOffset]));
    }

    const minAngle = Math.min(...seamAngles);
    const maxAngle = Math.max(...seamAngles);
    expect(maxAngle - minAngle).toBeLessThan(0.05);
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

  it("keeps the faceted seam on the same back corner through profile rotation", () => {
    const params = defaultVaseParameters();
    params.radialSamples = 48;
    params.verticalSamples = 2;
    params.textureMode = "Texture imposée";
    params.textureType = "Cannelures";
    params.profiles = [
      createProfile({ zRatio: 0, diameter: 80, sides: 6, rotationDeg: 0 }),
      createProfile({ zRatio: 1, diameter: 80, sides: 6, rotationDeg: 30 }),
    ];

    const contour = generateTopOuterContour(params);
    const seamAngleDeg = (Math.atan2(contour[1], contour[0]) * 180) / Math.PI;

    expect(seamAngleDeg).toBeCloseTo(-90, 0);
  });
});
