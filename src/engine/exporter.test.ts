import { describe, it, expect } from "vitest";
import { buildSTLBuffer } from "./exporter";
import type { MeshData } from "./types";

// We test the STL binary generation logic without triggering DOM download
describe("STL export format", () => {
  it("generates correct binary STL structure", () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ]),
      indices: new Uint32Array([
        0, 2, 1,
        0, 1, 3,
        1, 2, 3,
        2, 0, 3,
      ]),
    };

    const buffer = buildSTLBuffer(mesh);
    const view = new DataView(buffer);
    const header = Array.from({ length: 80 }, (_, index) => String.fromCharCode(view.getUint8(index))).join("");

    expect(header).toContain("Vaso STL");
    expect(header).toContain("wt=1");
    expect(view.getUint32(80, true)).toBe(4);
    expect(buffer.byteLength).toBe(80 + 4 + 4 * 50);
  });

  it("rejects non-watertight meshes", () => {
    const mesh: MeshData = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };

    expect(() => buildSTLBuffer(mesh)).toThrow(/Invalid STL export/);
  });
});
