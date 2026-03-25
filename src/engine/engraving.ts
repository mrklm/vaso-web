import * as THREE from "three";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MeshData, VaseParameters } from "./types";
import { appendPipelineTrace } from "./pipeline-trace";
import { formatEngravingLines } from "./engraving-text";
import {
  countBoundaryEdges,
  countBoundaryLoopsAtZ,
  describeEdgeConnectedMeshComponents,
  describeNonSimplePlanarBoundaryComponentsAtZ,
  describePlanarBoundaryComponentsAtZ,
  describeBoundaryEdgeAnomaliesAtZ,
  extractSimplePlanarBoundaryLoopsAtZ,
  getMeshDifferenceDiagnostics,
  logMeshDiagnostics,
  removeAnomalousPatchBoundaryTrianglesAtZ,
  removeDegenerateTriangles,
  removeTrianglesOnPlaneMatchingBase,
  removeSmallEdgeConnectedComponents,
  retainLargestConnectedMeshComponent,
  sealPlanarBoundaryLoopAtZ,
  sealResidualPlanarBoundaryComponentsAtZ,
  sealSimplePlanarBoundaryComponentsAtZ,
} from "./mesh-cleanup";

const ROBOTO_FONT_URL = "/fonts/Roboto.json";
const FONT_LINE_HEIGHT = 11;
const FIT_MARGIN_MM = 4;
const TARGET_ENGRAVING_DEPTH_MM = 0.9;
const MIN_REMAINING_BOTTOM_MM = 1.2;
const ENGRAVING_SURFACE_OVERLAP_MM = 0.02;
const GEOMETRY_WELD_TOLERANCE_MM = 1e-3;
const PLANAR_PATCH_TOLERANCE_MM = 1e-4;
const BOTTOM_FINISH_WELD_TOLERANCE_MM = 2e-4;
const BOTTOM_FINISH_PLANE_TOLERANCE_MM = 5e-4;
const ADDITIVE_TEXT_DEGENERATE_AREA_EPSILON_MM2 = 1e-12;
const DETACHED_FRAGMENT_MAX_TRIANGLES = 64;
const DETACHED_FRAGMENT_MAX_Z_MM = TARGET_ENGRAVING_DEPTH_MM + 0.05;
const RAW_LINE_SIZES = [8.6, 7.1] as const;
const TEXT_WIDTH_FACTOR = 0.58;
const TEXT_HEIGHT_FACTOR = 0.45;
const TEXT_CURVE_SEGMENTS = 10;

let robotoFontPromise: Promise<Font> | null = null;

interface ComparisonStage {
  label: string;
  identical: boolean;
  sharedTriangles: number;
  removedTriangles: number;
  addedTriangles: number;
  sharedTriangleRatio: number;
}

function traceBoundaryComponents(label: string, mesh: MeshData, tolerance = BOTTOM_FINISH_PLANE_TOLERANCE_MM): void {
  const components = describePlanarBoundaryComponentsAtZ(mesh, 0, tolerance)
    .map(
      (component, index) =>
        `${index + 1}[v=${component.vertexCount},deg=${component.maxDegree},closed=${component.closed ? 1 : 0},simple=${component.simple ? 1 : 0},area=${component.area.toFixed(2)},bbox=${component.minX.toFixed(1)},${component.minY.toFixed(1)}:${component.maxX.toFixed(1)},${component.maxY.toFixed(1)},tri=${component.triangleCount}]`,
    )
    .join(";");
  appendPipelineTrace(`${label}:${components || "none"}`);
  console.info(`${label}: ${components || "none"}`);
}

function traceNonSimpleBoundaryComponents(
  label: string,
  mesh: MeshData,
  tolerance = BOTTOM_FINISH_PLANE_TOLERANCE_MM,
): void {
  const description = describeNonSimplePlanarBoundaryComponentsAtZ(mesh, 0, tolerance) || "none";
  appendPipelineTrace(`${label}:${description}`);
  console.info(`${label}: ${description}`);
}

function traceBoundaryEdgeAnomalies(
  label: string,
  mesh: MeshData,
  patchTriangleStartIndex: number,
  tolerance = BOTTOM_FINISH_PLANE_TOLERANCE_MM,
): void {
  const description = describeBoundaryEdgeAnomaliesAtZ(mesh, 0, tolerance, patchTriangleStartIndex) || "none";
  appendPipelineTrace(`${label}:${description}`);
  console.info(`${label}: ${description}`);
}

function traceEdgeConnectedComponents(label: string, mesh: MeshData, tolerance = BOTTOM_FINISH_PLANE_TOLERANCE_MM): void {
  const description = describeEdgeConnectedMeshComponents(mesh, tolerance)
    .map(
      (component, index) =>
        `${index + 1}[t=${component.triangleCount},v=${component.vertexCount},bbox=${component.minX.toFixed(1)},${component.minY.toFixed(1)},${component.minZ.toFixed(1)}:${component.maxX.toFixed(1)},${component.maxY.toFixed(1)},${component.maxZ.toFixed(1)}]`,
    )
    .join(";");
  appendPipelineTrace(`${label}:${description || "none"}`);
  console.info(`${label}: ${description || "none"}`);
}

function traceMesh(label: string, mesh: MeshData, tolerance = BOTTOM_FINISH_PLANE_TOLERANCE_MM): void {
  const diagnostics = logMeshDiagnostics(label, mesh, tolerance);
  appendPipelineTrace(
    `${label}:v=${diagnostics.vertexCount},t=${diagnostics.triangleCount},c=${diagnostics.components},nm=${diagnostics.nonManifoldEdges},be=${diagnostics.boundaryEdges},bl=${diagnostics.boundaryLoops},wt=${diagnostics.watertight ? 1 : 0}`,
  );
}

function traceMeshComparison(
  label: string,
  baseMesh: MeshData,
  mesh: MeshData,
  tolerance = BOTTOM_FINISH_PLANE_TOLERANCE_MM,
  timeline?: ComparisonStage[],
): ComparisonStage {
  const difference = getMeshDifferenceDiagnostics(baseMesh, mesh, tolerance);
  const summary =
    `${label}:sameV=${difference.sameVertexCount ? 1 : 0},sameT=${difference.sameTriangleCount ? 1 : 0},` +
    `identical=${difference.identical ? 1 : 0},sharedT=${difference.sharedTriangles},` +
    `removedT=${difference.removedTriangles},addedT=${difference.addedTriangles},` +
    `sharedRatio=${difference.sharedTriangleRatio.toFixed(4)}`;
  appendPipelineTrace(summary);
  console.info(summary);
  const stage = {
    label,
    identical: difference.identical,
    sharedTriangles: difference.sharedTriangles,
    removedTriangles: difference.removedTriangles,
    addedTriangles: difference.addedTriangles,
    sharedTriangleRatio: difference.sharedTriangleRatio,
  };
  timeline?.push(stage);
  return stage;
}

function summarizeComparisonTimeline(timeline: ComparisonStage[]): void {
  const firstDifferent = timeline.find((stage) => !stage.identical);
  const firstReverted = firstDifferent
    ? timeline
      .slice(timeline.indexOf(firstDifferent) + 1)
      .find((stage) => stage.identical)
    : undefined;

  appendPipelineTrace(
    `[engraving] first differing stage=${firstDifferent?.label ?? "none"}`,
  );
  appendPipelineTrace(
    `[engraving] first reverted-to-identical stage=${firstReverted?.label ?? "none"}`,
  );
}

function computeContourMinRadius(contour: Float64Array): number {
  let minRadius = Number.POSITIVE_INFINITY;
  for (let i = 0; i < contour.length / 2; i++) {
    const x = contour[i * 2];
    const y = contour[i * 2 + 1];
    minRadius = Math.min(minRadius, Math.hypot(x, y));
  }
  return minRadius;
}

async function loadRobotoFont(): Promise<Font> {
  if (!robotoFontPromise) {
    robotoFontPromise = (async () => {
      const candidates = new Set<string>([ROBOTO_FONT_URL]);

      if (typeof window !== "undefined") {
        candidates.add(new URL("fonts/Roboto.json", window.location.href).toString());
      }

      if (typeof window !== "undefined" && import.meta.env?.BASE_URL) {
        const baseUrl = import.meta.env.BASE_URL.endsWith("/")
          ? import.meta.env.BASE_URL
          : `${import.meta.env.BASE_URL}/`;
        candidates.add(new URL(`${baseUrl}fonts/Roboto.json`, window.location.href).toString());
      }

      let lastError: Error | null = null;
      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Impossible de charger la police Roboto (${response.status}).`);
          }
          return new FontLoader().parse(await response.json());
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      throw lastError ?? new Error("Impossible de charger la police Roboto.");
    })().catch((error) => {
      robotoFontPromise = null;
      throw error;
    });
  }

  return robotoFontPromise;
}

function createLineGeometry(font: Font, text: string, size: number): THREE.BufferGeometry {
  const geometry = new TextGeometry(text, {
    font,
    size,
    depth: 1,
    curveSegments: TEXT_CURVE_SEGMENTS,
    bevelEnabled: false,
  });
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds) {
    const centerX = (bounds.min.x + bounds.max.x) * 0.5;
    geometry.translate(-centerX, 0, 0);
  }
  geometry.clearGroups();
  return geometry;
}

function buildTextGeometry(font: Font, seed: number): THREE.BufferGeometry | null {
  const lines = formatEngravingLines(seed);
  const rawGeometries = lines.map((line, index) => createLineGeometry(font, line, RAW_LINE_SIZES[index]));

  const yOffsets = [FONT_LINE_HEIGHT * 0.5, -FONT_LINE_HEIGHT * 0.5];
  rawGeometries.forEach((geometry, index) => geometry.translate(0, yOffsets[index], 0));

  const merged = mergeGeometries(rawGeometries, false);
  rawGeometries.forEach((geometry) => geometry.dispose());

  if (!merged) return null;
  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) {
    merged.dispose();
    return null;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  merged.translate(-center.x, -center.y, 0);
  merged.clearGroups();
  return merged;
}

function meshDataToGeometry(meshData: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(meshData.vertices, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
  geometry.computeVertexNormals();
  geometry.clearGroups();
  return geometry;
}

function geometryToMeshData(geometry: THREE.BufferGeometry): MeshData {
  const prepared = geometry.clone();
  const position = prepared.getAttribute("position");
  if (!position) {
    throw new Error("La géométrie gravée résultante est invalide.");
  }

  let index = prepared.getIndex();
  if (!index) {
    const indices = new Uint32Array(position.count);
    for (let i = 0; i < position.count; i++) indices[i] = i;
    prepared.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
    index = prepared.getIndex();
  }

  if (!index) {
    prepared.dispose();
    throw new Error("La géométrie gravée résultante ne contient pas d'index.");
  }

  const result = {
    vertices: new Float32Array(position.array as ArrayLike<number>),
    indices: new Uint32Array(index.array as ArrayLike<number>),
  };
  prepared.dispose();
  return result;
}

function combineMeshDataParts(parts: MeshData[]): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const part of parts) {
    vertices.push(...part.vertices);
    for (const index of part.indices) {
      indices.push(index + vertexOffset);
    }
    vertexOffset += part.vertices.length / 3;
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function rebuildBottomPlanarPatch(
  mesh: MeshData,
  comparisonMesh: MeshData,
  referenceBottomMesh: MeshData,
  _font: Font,
  _bottomOuterContour: Float64Array,
  _seed: number,
  timeline?: ComparisonStage[],
): MeshData {
  let finishedMesh = removeDegenerateTriangles(
    removeTrianglesOnPlaneMatchingBase(mesh, referenceBottomMesh, 0, BOTTOM_FINISH_PLANE_TOLERANCE_MM),
  );
  const trimmedAfterPlaneRemoval = removeSmallEdgeConnectedComponents(
    finishedMesh,
    DETACHED_FRAGMENT_MAX_TRIANGLES,
    DETACHED_FRAGMENT_MAX_Z_MM,
    BOTTOM_FINISH_PLANE_TOLERANCE_MM,
  );
  if (trimmedAfterPlaneRemoval.indices.length !== finishedMesh.indices.length) {
    finishedMesh = trimmedAfterPlaneRemoval;
    traceMesh("[engraving] after dropping detached fragments", finishedMesh);
    traceMeshComparison("[engraving] compare after dropping detached fragments vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
  }
  traceMesh("[engraving] after removeTrianglesOnPlane", finishedMesh);
  traceMeshComparison("[engraving] compare after removeTrianglesOnPlane vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
  traceBoundaryComponents("[engraving] loops after removeTrianglesOnPlane", finishedMesh);
  const extractedLoops = extractSimplePlanarBoundaryLoopsAtZ(finishedMesh, 0, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
  if (extractedLoops.length === 1) {
    const deterministicPatch = buildDeterministicTextAwareBottomPatch(
      finishedMesh,
      _font,
      _bottomOuterContour,
      _seed,
    );
    if (deterministicPatch) {
      const deterministicComponents = describeEdgeConnectedMeshComponents(
        deterministicPatch,
        BOTTOM_FINISH_PLANE_TOLERANCE_MM,
      );
      if (deterministicComponents.length === 1) {
        finishedMesh = deterministicPatch;
        traceMesh("[engraving] after deterministic text-aware patch", finishedMesh);
        traceMeshComparison("[engraving] compare after deterministic text-aware patch vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
      } else {
        appendPipelineTrace(
          `[engraving] skipped deterministic text-aware patch: components=${deterministicComponents.length},largest=${deterministicComponents[0]?.triangleCount ?? 0},second=${deterministicComponents[1]?.triangleCount ?? 0}`,
        );
      }
    }
  }
  let previousBoundaryEdges = countBoundaryEdges(finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM);

  for (let pass = 0; pass < 8 && previousBoundaryEdges > 0; pass++) {
    const patchTriangleStartIndex = finishedMesh.indices.length / 3;
    traceEdgeConnectedComponents(`[engraving] components before planar seal pass ${pass + 1}`, finishedMesh);
    const sealedCandidate = removeDegenerateTriangles(
      sealPlanarBoundaryLoopAtZ(
        finishedMesh,
        0,
        BOTTOM_FINISH_PLANE_TOLERANCE_MM,
        { preserveMicroHoles: true },
      ),
    );
    const nextBoundaryEdges = countBoundaryEdges(sealedCandidate, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
    if (nextBoundaryEdges >= previousBoundaryEdges) break;
    finishedMesh = sealedCandidate;
    previousBoundaryEdges = nextBoundaryEdges;
    traceMesh(`[engraving] after planar seal pass ${pass + 1}`, finishedMesh);
    traceMeshComparison(`[engraving] compare after planar seal pass ${pass + 1} vs base`, comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
    traceEdgeConnectedComponents(`[engraving] components after planar seal pass ${pass + 1}`, finishedMesh);
    if (pass === 0) {
      traceBoundaryComponents("[engraving] loops after planar seal pass 1", finishedMesh);
      traceNonSimpleBoundaryComponents("[engraving] non-simple after planar seal pass 1", finishedMesh);
      traceBoundaryEdgeAnomalies("[engraving] anomalous boundary edges after planar seal pass 1", finishedMesh, patchTriangleStartIndex);
      const anomalyCleanedCandidate = removeDegenerateTriangles(
        removeAnomalousPatchBoundaryTrianglesAtZ(
          finishedMesh,
          0,
          BOTTOM_FINISH_PLANE_TOLERANCE_MM,
          patchTriangleStartIndex,
        ),
      );
      const anomalyBoundaryEdges = countBoundaryEdges(anomalyCleanedCandidate, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
      if (anomalyBoundaryEdges < previousBoundaryEdges) {
        finishedMesh = anomalyCleanedCandidate;
        previousBoundaryEdges = anomalyBoundaryEdges;
        traceMesh("[engraving] after anomalous patch cleanup", finishedMesh);
        traceMeshComparison("[engraving] compare after anomalous patch cleanup vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
        traceBoundaryComponents("[engraving] loops after anomalous patch cleanup", finishedMesh);
      }
    }
  }

  const weldedGeometry = mergeVertices(
    meshDataToGeometry(finishedMesh),
    BOTTOM_FINISH_WELD_TOLERANCE_MM,
  );
  weldedGeometry.computeVertexNormals();
  const weldedMesh = geometryToMeshData(weldedGeometry);
  weldedGeometry.dispose();
  appendPipelineTrace(
    `[engraving] bottom weld mergedVertices=${finishedMesh.vertices.length / 3 - weldedMesh.vertices.length / 3}`,
  );

  finishedMesh = removeDegenerateTriangles(weldedMesh);
  const trimmedAfterBottomWeld = removeSmallEdgeConnectedComponents(
    finishedMesh,
    DETACHED_FRAGMENT_MAX_TRIANGLES,
    DETACHED_FRAGMENT_MAX_Z_MM,
    BOTTOM_FINISH_PLANE_TOLERANCE_MM,
  );
  if (trimmedAfterBottomWeld.indices.length !== finishedMesh.indices.length) {
    finishedMesh = trimmedAfterBottomWeld;
    traceMesh("[engraving] after dropping detached fragments post-weld", finishedMesh);
    traceMeshComparison("[engraving] compare after dropping detached fragments post-weld vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
  }
  traceMesh("[engraving] after bottom weld", finishedMesh);
  traceMeshComparison("[engraving] compare after bottom weld vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
  traceEdgeConnectedComponents("[engraving] components after bottom weld", finishedMesh);
  previousBoundaryEdges = countBoundaryEdges(finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM);

  for (let pass = 0; pass < 2 && previousBoundaryEdges > 0; pass++) {
    const sealedCandidate = removeDegenerateTriangles(
      sealPlanarBoundaryLoopAtZ(
        finishedMesh,
        0,
        BOTTOM_FINISH_PLANE_TOLERANCE_MM,
        { preserveMicroHoles: true },
      ),
    );
    const nextBoundaryEdges = countBoundaryEdges(sealedCandidate, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
    if (nextBoundaryEdges >= previousBoundaryEdges) break;
    finishedMesh = sealedCandidate;
    previousBoundaryEdges = nextBoundaryEdges;
    traceMesh(`[engraving] after post-weld planar seal ${pass + 1}`, finishedMesh);
    traceMeshComparison(`[engraving] compare after post-weld planar seal ${pass + 1} vs base`, comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
  }

  if (previousBoundaryEdges > 0) {
    const residualCandidate = removeDegenerateTriangles(
      sealSimplePlanarBoundaryComponentsAtZ(
        finishedMesh,
        0,
        BOTTOM_FINISH_PLANE_TOLERANCE_MM,
      ),
    );
    const residualBoundaryEdges = countBoundaryEdges(residualCandidate, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
    if (residualBoundaryEdges < previousBoundaryEdges) {
      finishedMesh = residualCandidate;
      previousBoundaryEdges = residualBoundaryEdges;
      traceMesh("[engraving] after residual simple seal", finishedMesh);
      traceMeshComparison("[engraving] compare after residual simple seal vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
    }
  }

  if (previousBoundaryEdges > 0) {
    const reweldedGeometry = mergeVertices(
      meshDataToGeometry(finishedMesh),
      BOTTOM_FINISH_WELD_TOLERANCE_MM,
    );
    const reweldedMesh = removeDegenerateTriangles(geometryToMeshData(reweldedGeometry));
    reweldedGeometry.dispose();

    const reweldedCandidate = removeDegenerateTriangles(
      sealSimplePlanarBoundaryComponentsAtZ(
        reweldedMesh,
        0,
        BOTTOM_FINISH_PLANE_TOLERANCE_MM,
      ),
    );
    const reweldedBoundaryEdges = countBoundaryEdges(reweldedCandidate, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
    if (reweldedBoundaryEdges < previousBoundaryEdges) {
      finishedMesh = reweldedCandidate;
      previousBoundaryEdges = reweldedBoundaryEdges;
      traceMesh("[engraving] after rewelded residual seal", finishedMesh);
      traceMeshComparison("[engraving] compare after rewelded residual seal vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
    }
  }

  if (previousBoundaryEdges > 0) {
    const deterministicCandidate = removeDegenerateTriangles(
      sealResidualPlanarBoundaryComponentsAtZ(
        finishedMesh,
        0,
        BOTTOM_FINISH_PLANE_TOLERANCE_MM,
      ),
    );
    const deterministicBoundaryEdges = countBoundaryEdges(
      deterministicCandidate,
      BOTTOM_FINISH_PLANE_TOLERANCE_MM,
    );
    if (deterministicBoundaryEdges < previousBoundaryEdges) {
      finishedMesh = deterministicCandidate;
      previousBoundaryEdges = deterministicBoundaryEdges;
      traceMesh("[engraving] after deterministic residual seal", finishedMesh);
      traceMeshComparison("[engraving] compare after deterministic residual seal vs base", comparisonMesh, finishedMesh, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
    }
  }

  const finalBottom = retainLargestConnectedMeshComponent(finishedMesh);
  traceMesh("[engraving] final bottom-closed mesh", finalBottom);
  traceMeshComparison("[engraving] compare final bottom-closed mesh vs base", comparisonMesh, finalBottom, BOTTOM_FINISH_PLANE_TOLERANCE_MM, timeline);
  return finalBottom;
}

function subdivideBottomCapTriangles(
  meshData: MeshData,
  zValue = 0,
  tolerance = 1e-6,
): MeshData {
  const nextVertices = Array.from(meshData.vertices);
  const nextIndices: number[] = [];

  for (let tri = 0; tri < meshData.indices.length; tri += 3) {
    const a = meshData.indices[tri];
    const b = meshData.indices[tri + 1];
    const c = meshData.indices[tri + 2];

    const az = meshData.vertices[a * 3 + 2];
    const bz = meshData.vertices[b * 3 + 2];
    const cz = meshData.vertices[c * 3 + 2];
    const onBottom =
      Math.abs(az - zValue) <= tolerance &&
      Math.abs(bz - zValue) <= tolerance &&
      Math.abs(cz - zValue) <= tolerance;

    if (!onBottom) {
      nextIndices.push(a, b, c);
      continue;
    }

    const ax = meshData.vertices[a * 3];
    const ay = meshData.vertices[a * 3 + 1];
    const bx = meshData.vertices[b * 3];
    const by = meshData.vertices[b * 3 + 1];
    const cx = meshData.vertices[c * 3];
    const cy = meshData.vertices[c * 3 + 1];
    const centroidIndex = nextVertices.length / 3;
    nextVertices.push(
      (ax + bx + cx) / 3,
      (ay + by + cy) / 3,
      zValue,
    );

    nextIndices.push(
      a, b, centroidIndex,
      b, c, centroidIndex,
      c, a, centroidIndex,
    );
  }

  return {
    vertices: new Float32Array(nextVertices),
    indices: new Uint32Array(nextIndices),
  };
}

function flipGeometryWinding(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex();
  if (index) {
    const array = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < array.length; i += 3) {
      const b = array[i + 1];
      array[i + 1] = array[i + 2];
      array[i + 2] = b;
    }
    index.needsUpdate = true;
    return;
  }

  const position = geometry.getAttribute("position");
  if (!position) return;

  for (let i = 0; i < position.count; i += 3) {
    for (let axis = 0; axis < position.itemSize; axis++) {
      const value = position.getComponent(i + 1, axis);
      position.setComponent(i + 1, axis, position.getComponent(i + 2, axis));
      position.setComponent(i + 2, axis, value);
    }
  }
  position.needsUpdate = true;
}

function buildAdditiveTextGeometry(
  font: Font,
  params: VaseParameters,
  bottomOuterContour: Float64Array,
  seed: number,
): THREE.BufferGeometry | null {
  if (!params.closeBottom) {
    appendPipelineTrace("[engraving] skipped: closeBottom=0");
    return null;
  }

  appendPipelineTrace(
    `[engraving] requested depth=${TARGET_ENGRAVING_DEPTH_MM.toFixed(3)}mm,bottomThickness=${params.bottomThicknessMm.toFixed(3)}mm,minimumRemaining=${MIN_REMAINING_BOTTOM_MM.toFixed(3)}mm`,
  );
  const maxDepth = Math.min(
    TARGET_ENGRAVING_DEPTH_MM,
    params.bottomThicknessMm - MIN_REMAINING_BOTTOM_MM,
  );
  if (maxDepth <= 0) {
    appendPipelineTrace(`[engraving] skipped: effective depth=${maxDepth.toFixed(3)}mm`);
    return null;
  }
  appendPipelineTrace(`[engraving] text depth=${maxDepth.toFixed(3)}mm`);

  const fitRadius = computeContourMinRadius(bottomOuterContour) - FIT_MARGIN_MM;
  appendPipelineTrace(`[engraving] fit radius=${fitRadius.toFixed(3)}mm`);
  if (fitRadius <= 8) {
    appendPipelineTrace(`[engraving] skipped: fit radius too small (${fitRadius.toFixed(3)}mm)`);
    return null;
  }

  const merged = buildTextGeometry(font, seed);
  if (!merged) return null;

  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) {
    merged.dispose();
    return null;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const xyScale = Math.min((fitRadius * TEXT_WIDTH_FACTOR) / size.x, (fitRadius * TEXT_HEIGHT_FACTOR) / size.y);
  appendPipelineTrace(
    `[engraving] text bounds width=${size.x.toFixed(3)}mm,height=${size.y.toFixed(3)}mm,xyScale=${xyScale.toFixed(4)}`,
  );
  merged.scale(xyScale, xyScale, maxDepth + ENGRAVING_SURFACE_OVERLAP_MM);
  const innerBottomZ = Math.min(params.bottomThicknessMm, params.heightMm);
  merged.translate(0, 0, innerBottomZ - ENGRAVING_SURFACE_OVERLAP_MM);
  // TextGeometry duplicates seam vertices when normals/UVs differ; strip them
  // so mergeVertices can weld the solid by position and keep it watertight.
  merged.deleteAttribute("normal");
  merged.deleteAttribute("uv");
  merged.clearGroups();
  const weldedText = mergeVertices(merged, GEOMETRY_WELD_TOLERANCE_MM);
  merged.dispose();
  weldedText.computeVertexNormals();
  weldedText.computeBoundingBox();
  return weldedText;
}

function orient2DContour(contour: THREE.Vector2[], clockwise: boolean): THREE.Vector2[] {
  const area = THREE.ShapeUtils.area(contour);
  if ((clockwise && area > 0) || (!clockwise && area < 0)) {
    return [...contour].reverse();
  }
  return contour;
}

function buildTextPatchContours(
  font: Font,
  bottomOuterContour: Float64Array,
  seed: number,
): { cutouts: THREE.Vector2[][]; islands: THREE.Vector2[][] } | null {
  const fitRadius = computeContourMinRadius(bottomOuterContour) - FIT_MARGIN_MM;
  if (fitRadius <= 8) return null;

  const lines = formatEngravingLines(seed);
  const lineOffsets = [FONT_LINE_HEIGHT * 0.5, -FONT_LINE_HEIGHT * 0.5];
  const rawOuterContours: THREE.Vector2[][] = [];
  const rawIslandContours: THREE.Vector2[][] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const shapes = font.generateShapes(lines[lineIndex], RAW_LINE_SIZES[lineIndex]);
    const extracted = shapes.map((shape) => shape.extractPoints(TEXT_CURVE_SEGMENTS));
    const outerPoints = extracted.flatMap((entry) => entry.shape);
    if (outerPoints.length === 0) continue;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const point of outerPoints) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
    }
    const lineCenterX = (minX + maxX) * 0.5;
    const translatedOuterContours = extracted.map((entry) =>
      entry.shape.map((point) => new THREE.Vector2(point.x - lineCenterX, point.y + lineOffsets[lineIndex])),
    );
    const translatedIslandContours = extracted.flatMap((entry) =>
      entry.holes.map((hole) => hole.map((point) => new THREE.Vector2(point.x - lineCenterX, point.y + lineOffsets[lineIndex]))),
    );
    rawOuterContours.push(...translatedOuterContours);
    rawIslandContours.push(...translatedIslandContours);
  }

  const allPoints = [...rawOuterContours.flat(), ...rawIslandContours.flat()];
  if (allPoints.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of allPoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const width = maxX - minX;
  const height = maxY - minY;
  const xyScale = Math.min((fitRadius * TEXT_WIDTH_FACTOR) / width, (fitRadius * TEXT_HEIGHT_FACTOR) / height);

  const normalize = (contour: THREE.Vector2[]) =>
    contour.map((point) => new THREE.Vector2(-(point.x - centerX) * xyScale, (point.y - centerY) * xyScale));

  return {
    cutouts: rawOuterContours.map(normalize),
    islands: rawIslandContours.map(normalize),
  };
}

function buildDeterministicTextAwareBottomPatch(
  mesh: MeshData,
  font: Font,
  bottomOuterContour: Float64Array,
  seed: number,
): MeshData | null {
  const loops = extractSimplePlanarBoundaryLoopsAtZ(mesh, 0, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
  const outerLoop = loops.find((loop) => loop.area > 0);
  if (!outerLoop) return null;

  const textContours = buildTextPatchContours(font, bottomOuterContour, seed);
  if (!textContours || textContours.cutouts.length === 0) return null;

  const outerContour = outerLoop.contour;
  const outerVertices = outerLoop.loop;
  const cutouts = textContours.cutouts.map((contour) => orient2DContour(contour, true));
  const islands = textContours.islands.map((contour) => orient2DContour(contour, false));
  const triangles = THREE.ShapeUtils.triangulateShape(orient2DContour(outerContour, false), cutouts);
  if (triangles.length === 0) return null;

  const nextVertices = Array.from(mesh.vertices);
  const nextIndices = Array.from(mesh.indices);
  const patchVertexIndices = [...outerVertices];
  for (const contour of cutouts) {
    for (const point of contour) {
      patchVertexIndices.push(nextVertices.length / 3);
      nextVertices.push(point.x, point.y, 0);
    }
  }

  for (const [ia, ib, ic] of triangles) {
    nextIndices.push(patchVertexIndices[ic], patchVertexIndices[ib], patchVertexIndices[ia]);
  }

  for (const island of islands) {
    const islandTriangles = THREE.ShapeUtils.triangulateShape(island, []);
    if (islandTriangles.length === 0) continue;
    const islandVertexIndices: number[] = [];
    for (const point of island) {
      islandVertexIndices.push(nextVertices.length / 3);
      nextVertices.push(point.x, point.y, 0);
    }
    for (const [ia, ib, ic] of islandTriangles) {
      nextIndices.push(islandVertexIndices[ic], islandVertexIndices[ib], islandVertexIndices[ia]);
    }
  }

  appendPipelineTrace(
    `[engraving] deterministic text-aware patch cutouts=${cutouts.length},islands=${islands.length},outerVertices=${outerVertices.length},triangles=${triangles.length}`,
  );

  return removeDegenerateTriangles({
    vertices: new Float32Array(nextVertices),
    indices: new Uint32Array(nextIndices),
  });
}

export async function engraveBaseText(
  meshData: MeshData,
  params: VaseParameters,
  bottomOuterContour: Float64Array,
  seed: number,
): Promise<MeshData> {
  const comparisonTimeline: ComparisonStage[] = [];
  const engravingLines = formatEngravingLines(seed);
  appendPipelineTrace(`[engraving] text line 1=${engravingLines[0]}`);
  appendPipelineTrace(`[engraving] text line 2=${engravingLines[1]}`);
  console.info(`[engraving] text line 1=${engravingLines[0]}`);
  console.info(`[engraving] text line 2=${engravingLines[1]}`);
  traceMesh("[engraving] input mesh", meshData, PLANAR_PATCH_TOLERANCE_MM);
  traceMeshComparison("[engraving] compare input vs base", meshData, meshData, PLANAR_PATCH_TOLERANCE_MM, comparisonTimeline);
  const font = await loadRobotoFont();
  const additiveTextGeometry = buildAdditiveTextGeometry(font, params, bottomOuterContour, seed);
  if (!additiveTextGeometry) return meshData;

  const refinedBaseMesh = subdivideBottomCapTriangles(meshData);
  traceMesh("[engraving] after subdivideBottomCapTriangles", refinedBaseMesh, PLANAR_PATCH_TOLERANCE_MM);
  traceMeshComparison("[engraving] compare subdivided vs base", meshData, refinedBaseMesh, PLANAR_PATCH_TOLERANCE_MM, comparisonTimeline);
  const baseGeometry = meshDataToGeometry(refinedBaseMesh);
  const engraved = removeDegenerateTriangles(
    combineMeshDataParts([
      geometryToMeshData(baseGeometry),
      geometryToMeshData(additiveTextGeometry),
    ]),
    ADDITIVE_TEXT_DEGENERATE_AREA_EPSILON_MM2,
  );
  traceMesh("[engraving] after additive text merge", engraved, PLANAR_PATCH_TOLERANCE_MM);
  traceMeshComparison("[engraving] compare after additive text merge vs base", meshData, engraved, PLANAR_PATCH_TOLERANCE_MM, comparisonTimeline);
  traceBoundaryComponents("[engraving] loops after additive text merge", engraved, PLANAR_PATCH_TOLERANCE_MM);
  const finalBoundaryEdges = countBoundaryEdges(engraved, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
  if (finalBoundaryEdges > 0) {
    const finalBoundaryLoops = countBoundaryLoopsAtZ(engraved, 0, BOTTOM_FINISH_PLANE_TOLERANCE_MM);
    console.warn(
      `Bottom closure warning: mesh still has ${finalBoundaryEdges} boundary edges and ${finalBoundaryLoops} open loops on Z=0.`,
    );
  }
  traceMesh("[engraving] final mesh before export", engraved);
  traceMeshComparison("[engraving] compare final before export vs base", meshData, engraved, PLANAR_PATCH_TOLERANCE_MM, comparisonTimeline);
  summarizeComparisonTimeline(comparisonTimeline);

  baseGeometry.dispose();
  additiveTextGeometry.dispose();

  return engraved;
}
