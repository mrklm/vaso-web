import {
  logMeshDiagnostics,
  removeDegenerateTriangles,
} from "./mesh-cleanup";
import { appendPipelineTrace, dumpPipelineTrace, getPipelineTrace } from "./pipeline-trace";
import type { MeshData } from "./types";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";
const STL_PIPELINE_MARKER = `Vaso STL ${APP_VERSION} bf-r13`;
const STL_EXPORT_DEGENERATE_AREA_EPSILON_MM2 = 1e-12;

/**
 * Build a binary STL ArrayBuffer from mesh data.
 */
export function buildSTLBuffer(mesh: MeshData): ArrayBuffer {
  const cleanedMesh = removeDegenerateTriangles(mesh, STL_EXPORT_DEGENERATE_AREA_EPSILON_MM2);
  const diagnostics = logMeshDiagnostics(`[${STL_PIPELINE_MARKER}] just before STL export`, cleanedMesh);
  appendPipelineTrace(
    `[export] final:v=${diagnostics.vertexCount},t=${diagnostics.triangleCount},c=${diagnostics.components},nm=${diagnostics.nonManifoldEdges},be=${diagnostics.boundaryEdges},bl=${diagnostics.boundaryLoops},wt=${diagnostics.watertight ? 1 : 0}`,
  );
  dumpPipelineTrace(STL_PIPELINE_MARKER);
  const {
    components: connectedComponents,
    nonManifoldEdges,
    boundaryEdges,
    boundaryLoops,
    watertight,
    triangleCount: numTriangles,
  } = diagnostics;
  if (boundaryEdges > 0) {
    throw new Error(
      `[${STL_PIPELINE_MARKER}] Invalid STL export: components=${connectedComponents} nonManifold=${nonManifoldEdges} boundaryEdges=${boundaryEdges} boundaryLoops=${boundaryLoops} watertight=${watertight} trace=${getPipelineTrace()}`,
    );
  }

  // STL binary format: 80-byte header + 4-byte triangle count + 50 bytes per triangle
  const bufferSize = 80 + 4 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes, can be anything)
  const header = `${STL_PIPELINE_MARKER} be=${boundaryEdges} bl=${boundaryLoops} wt=${watertight ? 1 : 0}`;
  for (let i = 0; i < Math.min(header.length, 80); i++) {
    view.setUint8(i, header.charCodeAt(i));
  }

  // Triangle count
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  const v = cleanedMesh.vertices;
  const idx = cleanedMesh.indices;

  for (let t = 0; t < numTriangles; t++) {
    const i0 = idx[t * 3],
      i1 = idx[t * 3 + 1],
      i2 = idx[t * 3 + 2];

    // Vertices
    const ax = v[i0 * 3],
      ay = v[i0 * 3 + 1],
      az = v[i0 * 3 + 2];
    const bx = v[i1 * 3],
      by = v[i1 * 3 + 1],
      bz = v[i1 * 3 + 2];
    const cx = v[i2 * 3],
      cy = v[i2 * 3 + 1],
      cz = v[i2 * 3 + 2];

    // Normal (cross product of edges)
    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    // Normal
    view.setFloat32(offset, nx, true);
    offset += 4;
    view.setFloat32(offset, ny, true);
    offset += 4;
    view.setFloat32(offset, nz, true);
    offset += 4;

    // Vertex 1
    view.setFloat32(offset, ax, true);
    offset += 4;
    view.setFloat32(offset, ay, true);
    offset += 4;
    view.setFloat32(offset, az, true);
    offset += 4;

    // Vertex 2
    view.setFloat32(offset, bx, true);
    offset += 4;
    view.setFloat32(offset, by, true);
    offset += 4;
    view.setFloat32(offset, bz, true);
    offset += 4;

    // Vertex 3
    view.setFloat32(offset, cx, true);
    offset += 4;
    view.setFloat32(offset, cy, true);
    offset += 4;
    view.setFloat32(offset, cz, true);
    offset += 4;

    // Attribute byte count
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Export STL: uses native save dialog in Electron, browser download otherwise.
 */
export async function exportSTL(mesh: MeshData, filename = "vaso_export.stl"): Promise<void> {
  console.info(`[${STL_PIPELINE_MARKER}] Exporting ${filename}`);
  const buffer = buildSTLBuffer(mesh);

  // Electron: native save dialog
  if (window.electronAPI?.isElectron) {
    const result = await window.electronAPI.saveSTL(buffer);
    if (!result.success && result.error) {
      throw new Error(result.error);
    }
    return;
  }

  // Browser: download via blob
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
