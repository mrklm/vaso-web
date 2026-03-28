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
  describePlanarBoundaryComponentsAtZ,
  getMeshDifferenceDiagnostics,
  logMeshDiagnostics,
  removeDegenerateTriangles,
} from "./mesh-cleanup";

const ROBOTO_FONT_URL = "/fonts/Roboto.json";
const FONT_LINE_HEIGHT = 11;
const FIT_MARGIN_MM = 4;
const TARGET_ENGRAVING_DEPTH_MM = 0.9;
const MIN_REMAINING_BOTTOM_MM = 1.2;
const ENGRAVING_SURFACE_OVERLAP_MM = 0.02;
const GEOMETRY_WELD_TOLERANCE_MM = 1e-3;
const PLANAR_PATCH_TOLERANCE_MM = 1e-4;
const BOTTOM_FINISH_PLANE_TOLERANCE_MM = 5e-4;
const ADDITIVE_TEXT_DEGENERATE_AREA_EPSILON_MM2 = 1e-12;
const RAW_LINE_SIZES = [8.6, 7.1] as const;
const TEXT_WIDTH_FACTOR = 0.58;
const TEXT_HEIGHT_FACTOR = 0.45;
const TEXT_CURVE_SEGMENTS = 10;

// Print-safe engraving constants
const MIN_FEATURE_MM = 0.8; // Minimum printable feature size for 0.4mm nozzle
const MIN_ENGRAVING_DEPTH_MM = Math.max(0.8, 2 * 0.2); // At least 0.8mm or 2x layer height (assuming 0.2mm layer)
const OFFSET_DELTA_MM = MIN_FEATURE_MM / 2; // Offset amount for dilation

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

function buildTextGeometry(font: Font, seed: number, isSeedModified: boolean, printSafeScale: number = 1): THREE.BufferGeometry | null {
  const lines = formatEngravingLines(seed, isSeedModified);
  const rawGeometries = lines.map((line, index) => createLineGeometry(font, line, RAW_LINE_SIZES[index] * printSafeScale));

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

function buildAdditiveTextGeometry(
  font: Font,
  params: VaseParameters,
  bottomOuterContour: Float64Array,
  seed: number,
  isSeedModified: boolean,
): THREE.BufferGeometry | null {
  if (!params.closeBottom) {
    appendPipelineTrace("[engraving] skipped: closeBottom=0");
    return null;
  }

  appendPipelineTrace(
    `[engraving] requested depth=${TARGET_ENGRAVING_DEPTH_MM.toFixed(3)}mm,bottomThickness=${params.bottomThicknessMm.toFixed(3)}mm,minimumRemaining=${MIN_REMAINING_BOTTOM_MM.toFixed(3)}mm,scale=${params.scale.toFixed(3)},printSafe=${params.printSafeEngraving}`,
  );
  let effectiveDepth = Math.min(
    TARGET_ENGRAVING_DEPTH_MM,
    params.bottomThicknessMm - MIN_REMAINING_BOTTOM_MM,
  );
  if (params.printSafeEngraving) {
    effectiveDepth = Math.max(effectiveDepth, MIN_ENGRAVING_DEPTH_MM);
  }
  if (effectiveDepth <= 0) {
    appendPipelineTrace(`[engraving] skipped: effective depth=${effectiveDepth.toFixed(3)}mm`);
    return null;
  }
  appendPipelineTrace(`[engraving] text depth=${effectiveDepth.toFixed(3)}mm`);

  const fitRadius = computeContourMinRadius(bottomOuterContour) - FIT_MARGIN_MM;
  appendPipelineTrace(`[engraving] fit radius=${fitRadius.toFixed(3)}mm`);
  if (fitRadius <= 8) {
    appendPipelineTrace(`[engraving] skipped: fit radius too small (${fitRadius.toFixed(3)}mm)`);
    return null;
  }

  // Calculate compensation for user scale
  const compensatedScale = params.printSafeEngraving ? 1 / params.scale : 1;
  appendPipelineTrace(`[engraving] compensatedScale=${compensatedScale.toFixed(3)}`);

  const merged = buildTextGeometry(font, seed, isSeedModified, compensatedScale);
  if (!merged) return null;

  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) {
    merged.dispose();
    return null;
  }

  // Apply morphological offset for print-safe
  let offsetScale = 1;
  if (params.printSafeEngraving) {
    offsetScale = 1 + OFFSET_DELTA_MM / (RAW_LINE_SIZES[0] * compensatedScale * 0.1); // approximate
    merged.scale(offsetScale, offsetScale, 1);
    merged.computeBoundingBox();
    const newBounds = merged.boundingBox;
    if (newBounds) {
      appendPipelineTrace(`[engraving] applied offset scale=${offsetScale.toFixed(3)}, new bounds=${newBounds.getSize(new THREE.Vector3()).x.toFixed(3)}mm`);
    }
  }

  const currentBounds = merged.boundingBox;
  if (!currentBounds) {
    merged.dispose();
    return null;
  }

  const size = currentBounds.getSize(new THREE.Vector3());
  const xyScale = Math.min((fitRadius * TEXT_WIDTH_FACTOR) / size.x, (fitRadius * TEXT_HEIGHT_FACTOR) / size.y);
  appendPipelineTrace(
    `[engraving] text bounds width=${size.x.toFixed(3)}mm,height=${size.y.toFixed(3)}mm,xyScale=${xyScale.toFixed(4)}`,
  );

  // Estimate min feature size after scaling
  const estimatedStrokeWidth = (RAW_LINE_SIZES[0] * compensatedScale * offsetScale * xyScale * 0.1); // Rough estimate
  appendPipelineTrace(`[engraving] estimated min feature=${estimatedStrokeWidth.toFixed(3)}mm ${estimatedStrokeWidth < MIN_FEATURE_MM ? 'INVALID' : 'OK'} for FDM`);

  merged.scale(xyScale, xyScale, effectiveDepth + ENGRAVING_SURFACE_OVERLAP_MM);
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

export async function engraveBaseText(
  meshData: MeshData,
  params: VaseParameters,
  bottomOuterContour: Float64Array,
  seed: number,
  isSeedModified = false,
): Promise<MeshData> {
  const comparisonTimeline: ComparisonStage[] = [];
  const engravingLines = formatEngravingLines(seed, isSeedModified);
  appendPipelineTrace(`[engraving] text line 1=${engravingLines[0]}`);
  appendPipelineTrace(`[engraving] text line 2=${engravingLines[1]}`);
  console.info(`[engraving] text line 1=${engravingLines[0]}`);
  console.info(`[engraving] text line 2=${engravingLines[1]}`);
  traceMesh("[engraving] input mesh", meshData, PLANAR_PATCH_TOLERANCE_MM);
  traceMeshComparison("[engraving] compare input vs base", meshData, meshData, PLANAR_PATCH_TOLERANCE_MM, comparisonTimeline);
  const font = await loadRobotoFont();
  const additiveTextGeometry = buildAdditiveTextGeometry(font, params, bottomOuterContour, seed, isSeedModified);
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
