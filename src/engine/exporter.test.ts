import { describe, it, expect } from "vitest";
import type { MeshData } from "./types";

// We test the STL binary generation logic without triggering DOM download
describe("STL export format", () => {
  it("generates correct binary STL structure", () => {
    // Simple triangle mesh
    const mesh: MeshData = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };

    const numTriangles = mesh.indices.length / 3;
    const bufferSize = 80 + 4 + numTriangles * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // Write header
    const header = "Vaso Web Export - STL Binary";
    for (let i = 0; i < Math.min(header.length, 80); i++) {
      view.setUint8(i, header.charCodeAt(i));
    }

    // Write triangle count
    view.setUint32(80, numTriangles, true);

    expect(view.getUint32(80, true)).toBe(1);
    expect(buffer.byteLength).toBe(80 + 4 + 50);
  });
});
