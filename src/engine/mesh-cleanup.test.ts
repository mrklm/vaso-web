import { describe, expect, it } from "vitest";
import { ShapeUtils, Vector2 } from "three";
import {
  countConnectedMeshComponents,
  countEdgeConnectedMeshComponents,
  countBoundaryLoopsAtZ,
  retainLargestConnectedMeshComponent,
  sealPlanarBoundaryLoopAtZ,
  getMeshDifferenceDiagnostics,
  getMeshDiagnostics,
} from "./mesh-cleanup";
import { getPipelineTraceEntries, resetPipelineTrace } from "./pipeline-trace";
import type { MeshData } from "./types";

function buildOpenBottomPrismWithTopCap(outer: Vector2[], holes: Vector2[][]): MeshData {
  const rings = [outer, ...holes];
  const vertices: number[] = [];
  const ringOffsets: number[] = [];

  for (const ring of rings) {
    ringOffsets.push(vertices.length / 3);
    for (const point of ring) vertices.push(point.x, point.y, 0);
    for (const point of ring) vertices.push(point.x, point.y, 1);
  }

  const indices: number[] = [];
  const topVertexIndices: number[] = [];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    const baseOffset = ringOffsets[ringIndex];
    const topOffset = baseOffset + ring.length;
    for (let index = 0; index < ring.length; index++) topVertexIndices.push(topOffset + index);
    for (let index = 0; index < ring.length; index++) {
      const next = (index + 1) % ring.length;
      const bottomA = baseOffset + index;
      const bottomB = baseOffset + next;
      const topA = topOffset + index;
      const topB = topOffset + next;
      indices.push(bottomA, bottomB, topA);
      indices.push(bottomB, topB, topA);
    }
  }

  const topTriangles = ShapeUtils.triangulateShape(outer, holes);
  for (const [ia, ib, ic] of topTriangles) {
    indices.push(topVertexIndices[ia], topVertexIndices[ib], topVertexIndices[ic]);
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

describe("mesh cleanup", () => {
  it("counts disconnected mesh components", () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        10, 0, 0,
        11, 0, 0,
        10, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };

    expect(countConnectedMeshComponents(mesh)).toBe(2);
  });

  it("keeps only the largest connected component", () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
        10, 0, 0,
        11, 0, 0,
        10, 1, 0,
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        0, 2, 3,
        4, 5, 6,
      ]),
    };

    const cleaned = retainLargestConnectedMeshComponent(mesh);

    expect(countConnectedMeshComponents(cleaned)).toBe(1);
    expect(countEdgeConnectedMeshComponents(cleaned)).toBe(1);
    expect(cleaned.indices.length).toBe(6);
  });

  it("removes fragments that only touch the main mesh at a single vertex", () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
        1, 1, 0,
        1.2, 1, 0.2,
        1, 1.2, 0.2,
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        0, 2, 3,
        4, 5, 6,
      ]),
    };

    expect(countConnectedMeshComponents(mesh)).toBe(1);
    expect(countEdgeConnectedMeshComponents(mesh)).toBe(2);

    const cleaned = retainLargestConnectedMeshComponent(mesh);

    expect(countEdgeConnectedMeshComponents(cleaned)).toBe(1);
    expect(cleaned.indices.length).toBe(6);
  });

  it("preserves inner holes when sealing a planar annulus boundary", () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        -5, -5, 0,
        5, -5, 0,
        5, 5, 0,
        -5, 5, 0,
        -5, -5, 1,
        5, -5, 1,
        5, 5, 1,
        -5, 5, 1,
        -2, -2, 0,
        -2, 2, 0,
        2, 2, 0,
        2, -2, 0,
        -2, -2, 1,
        -2, 2, 1,
        2, 2, 1,
        2, -2, 1,
      ]),
      indices: new Uint32Array([
        0, 1, 4,
        1, 5, 4,
        1, 2, 5,
        2, 6, 5,
        2, 3, 6,
        3, 7, 6,
        3, 0, 7,
        0, 4, 7,
        8, 12, 9,
        9, 12, 13,
        9, 13, 10,
        10, 13, 14,
        10, 14, 11,
        11, 14, 15,
        11, 15, 8,
        8, 15, 12,
      ]),
    };

    const sealed = sealPlanarBoundaryLoopAtZ(mesh, 0);

    expect(countBoundaryLoopsAtZ(mesh, 0)).toBe(2);
    expect(countBoundaryLoopsAtZ(sealed, 0)).toBe(0);
    expect((sealed.indices.length - mesh.indices.length) / 3).toBe(8);
  });

  it("detects when a mesh is still geometrically different from the base mesh", () => {
    const baseMesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        0, 2, 3,
      ]),
    };
    const engravedLikeMesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
        0.5, 0.5, -0.2,
      ]),
      indices: new Uint32Array([
        0, 1, 4,
        1, 2, 4,
        2, 3, 4,
        3, 0, 4,
      ]),
    };

    const difference = getMeshDifferenceDiagnostics(baseMesh, engravedLikeMesh);

    expect(difference.identical).toBe(false);
    expect(difference.addedTriangles).toBeGreaterThan(0);
    expect(difference.removedTriangles).toBeGreaterThan(0);
  });

  it("avoids orphaning patch internal edges on quasi-colinear contour chains", () => {
    const outer = [
      new Vector2(-40, -20),
      new Vector2(40, -20),
      new Vector2(40, 20),
      new Vector2(-12, 20),
      new Vector2(-16, 13.07),
      new Vector2(-20, 6.14),
      new Vector2(-24, -0.79),
      new Vector2(-28, -7.72),
      new Vector2(-32, -14.65),
    ];
    const hole = [
      new Vector2(-6, -6),
      new Vector2(10, -6),
      new Vector2(10, 6),
      new Vector2(-6, 6),
    ];
    const mesh = buildOpenBottomPrismWithTopCap(outer, [hole]);

    resetPipelineTrace();
    const sealed = sealPlanarBoundaryLoopAtZ(mesh, 0);
    const trace = getPipelineTraceEntries().join(" | ");
    const diagnostics = getMeshDiagnostics(sealed);

    expect(countBoundaryLoopsAtZ(mesh, 0)).toBe(2);
    expect(countBoundaryLoopsAtZ(sealed, 0)).toBe(0);
    expect(diagnostics.boundaryEdges).toBe(0);
    expect(diagnostics.boundaryLoops).toBe(0);
    expect(diagnostics.watertight).toBe(true);
    expect(trace).toContain("patch orphanedInternalEdges=none");
    expect(trace).toContain("patch preWeldRemovedTriangles=0");
  });

  it("does not skip a large smooth bottom loop as degenerate just because simplification is aggressive", () => {
    const outer = Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return new Vector2(Math.cos(angle) * 40, Math.sin(angle) * 34.6);
    });
    const mesh = buildOpenBottomPrismWithTopCap(outer, []);

    resetPipelineTrace();
    const sealed = sealPlanarBoundaryLoopAtZ(mesh, 0, 5e-4);
    const trace = getPipelineTraceEntries().join(" | ");

    expect(countBoundaryLoopsAtZ(mesh, 0)).toBe(1);
    expect(countBoundaryLoopsAtZ(sealed, 0)).toBe(0);
    expect(trace).not.toContain("skipped degenerate planar loop");
  });

  it("does not collapse a large dense outer loop into a tiny fan patch", () => {
    const outer = Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return new Vector2(Math.cos(angle) * 40, Math.sin(angle) * 34.6);
    });
    const mesh = buildOpenBottomPrismWithTopCap(outer, []);

    resetPipelineTrace();
    sealPlanarBoundaryLoopAtZ(mesh, 0, 5e-4);
    const trace = getPipelineTraceEntries().join(" | ");

    expect(trace).toContain("outer sourceVertices=96,outerSanitizedVertices=96,outerUsedVertices=96");
    expect(trace).not.toContain("fanTriangles=6");
  });

  it("removes quasi-colinear outer contour chains before triangulating a preserved micro-hole patch", () => {
    const outer = [
      new Vector2(-40, 0),
      new Vector2(-38.75, -2.17),
      new Vector2(-37.5, -4.33),
      new Vector2(-36.25, -6.5),
      new Vector2(-28.75, -19.49),
      new Vector2(-27.5, -21.65),
      new Vector2(-26.25, -23.82),
      new Vector2(-25, -25.98),
      new Vector2(-23.75, -28.15),
      new Vector2(-22.5, -30.31),
      new Vector2(22.5, -30.31),
      new Vector2(23.75, -28.15),
      new Vector2(25, -25.98),
      new Vector2(26.25, -23.82),
      new Vector2(27.5, -21.65),
      new Vector2(28.75, -19.49),
      new Vector2(36.25, -6.5),
      new Vector2(37.5, -4.33),
      new Vector2(38.75, -2.17),
      new Vector2(40, 0),
      new Vector2(38.75, 2.17),
      new Vector2(37.5, 4.33),
      new Vector2(36.25, 6.5),
      new Vector2(28.75, 19.49),
      new Vector2(27.5, 21.65),
      new Vector2(26.25, 23.82),
      new Vector2(25, 25.98),
      new Vector2(23.75, 28.15),
      new Vector2(22.5, 30.31),
      new Vector2(-22.5, 30.31),
      new Vector2(-23.75, 28.15),
      new Vector2(-25, 25.98),
      new Vector2(-26.25, 23.82),
      new Vector2(-27.5, 21.65),
      new Vector2(-28.75, 19.49),
      new Vector2(-36.25, 6.5),
      new Vector2(-37.5, 4.33),
      new Vector2(-38.75, 2.17),
    ];
    const hole = Array.from({ length: 10 }, (_, index) => {
      const angle = (index / 10) * Math.PI * 2;
      return new Vector2(-0.7 + Math.cos(angle) * 0.4, 1.2 + Math.sin(angle) * 0.45);
    });
    const mesh = buildOpenBottomPrismWithTopCap(outer, [hole]);

    resetPipelineTrace();
    const sealed = sealPlanarBoundaryLoopAtZ(mesh, 0, 5e-4, { preserveMicroHoles: true });
    const trace = getPipelineTraceEntries().join(" | ");
    const diagnostics = getMeshDiagnostics(sealed, 5e-4);

    expect(diagnostics.boundaryEdges).toBe(0);
    expect(diagnostics.boundaryLoops).toBe(0);
    expect(trace).toContain("patch orphanedInternalEdges=none");
    expect(trace).not.toContain("patchPreWeldCleanedTriangles=74");
  });
});
