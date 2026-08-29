import * as THREE from "three";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MeshData, VaseParameters } from "./types";
import { appendPipelineTrace, getPipelineTrace } from "./pipeline-trace";
import { formatEngravingLines, formatSupportEngravingLines } from "./engraving-text";
import { offsetPlanarPolygon, sanitizePlanarContour } from "./engraving-planar";
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
const TARGET_UNDERSIDE_ENGRAVING_DEPTH_MM = 0.65;
const MIN_REMAINING_BOTTOM_MM = 1.2;
const ENGRAVING_SURFACE_OVERLAP_MM = 0.02;
const GEOMETRY_WELD_TOLERANCE_MM = 1e-3;
const PLANAR_PATCH_TOLERANCE_MM = 1e-4;
const BOTTOM_FINISH_PLANE_TOLERANCE_MM = 5e-4;
const ADDITIVE_TEXT_DEGENERATE_AREA_EPSILON_MM2 = 1e-12;
const RAW_LINE_SIZES = [8.6, 7.8, 7.2] as const;
const TEXT_LINE_WIDTH_FACTORS = [1.9, 1.9] as const;
const UNDERSIDE_TEXT_WIDTH_FACTOR = 1.78;
const UNDERSIDE_TEXT_MAX_HEIGHT_FACTOR = 0.28;
const UNDERSIDE_TEXT_OFFSET_Y_FACTOR = -0.34;
const UNDERSIDE_PATCH_RADIAL_STEPS = 144;
const UNDERSIDE_PATCH_ANGULAR_SUBDIVISIONS = 8;
const UNDERSIDE_PATCH_MIN_ANGULAR_SLICES = 384;
const TEXT_SIGNATURE_HEIGHT_FACTOR = 0.92;
const TEXT_MAX_HEIGHT_FACTOR = 0.78;
const TEXT_LINE_GAP_FACTOR = 1.85;
const TEXT_SIDE_MARGIN_MM = 0.8;
const TEXT_RESERVED_CENTER_CLEARANCE_MM = 0.2;
const SUPPORT_TEXT_VERTICAL_MARGIN_MM = 0.45;
const TEXT_CURVE_SEGMENTS = 10;
const PLANAR_TEXT_SIMPLIFICATION_MM = 0.05;

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

function buildPrintableLineGeometry(
  font: Font,
  text: string,
  size: number,
  printSafeScale: number,
  printSafe: boolean,
): { geometry: THREE.BufferGeometry | null; removedContours: number; removedHoles: number } {
  const rawShapes = font.generateShapes(text, size * printSafeScale);
  const printableShapes: THREE.Shape[] = [];
  let removedContours = 0;
  let removedHoles = 0;

  for (const rawShape of rawShapes) {
    const extracted = rawShape.extractPoints(TEXT_CURVE_SEGMENTS);
    const polygon = {
      contour: sanitizePlanarContour(extracted.shape, PLANAR_TEXT_SIMPLIFICATION_MM),
      holes: extracted.holes.map((hole) => sanitizePlanarContour(hole, PLANAR_TEXT_SIMPLIFICATION_MM)),
    };

    if (polygon.contour.length < 3) {
      removedContours += 1;
      removedHoles += polygon.holes.length;
      continue;
    }

    const result = printSafe
      ? offsetPlanarPolygon(polygon, OFFSET_DELTA_MM, {
        minFeatureMm: MIN_FEATURE_MM,
        sanitizeToleranceMm: PLANAR_TEXT_SIMPLIFICATION_MM,
      })
      : { polygons: [polygon], removedContours: 0, removedHoles: 0 };

    removedContours += result.removedContours;
    removedHoles += result.removedHoles;

    for (const printablePolygon of result.polygons) {
      const shape = new THREE.Shape(printablePolygon.contour);
      for (const hole of printablePolygon.holes) {
        shape.holes.push(new THREE.Path(hole));
      }
      printableShapes.push(shape);
    }
  }

  if (printableShapes.length === 0) {
    return { geometry: null, removedContours, removedHoles };
  }

  const geometry = new THREE.ExtrudeGeometry(printableShapes, {
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
  return { geometry, removedContours, removedHoles };
}

function getGeometrySize(
  geometry: THREE.BufferGeometry,
  fallbackSize: number,
): { width: number; height: number } {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return { width: fallbackSize, height: fallbackSize };
  const size = bounds.getSize(new THREE.Vector3());
  return { width: size.x, height: size.y };
}

function buildSupportAwareTextGeometry(
  font: Font,
  seed: number,
  isSeedModified: boolean,
  fitRadius: number,
  printSafeScale: number,
  printSafe: boolean,
  supportRadius: number,
): THREE.BufferGeometry | null {
  const lines = formatSupportEngravingLines(seed, isSeedModified);
  const safeInnerRadius = supportRadius + SUPPORT_TEXT_VERTICAL_MARGIN_MM;
  const safeOuterRadius = fitRadius - TEXT_SIDE_MARGIN_MM;
  const availableBandHeight = safeOuterRadius - safeInnerRadius;
  if (availableBandHeight <= 1) return null;

  const lineResults = lines.map((line, lineIndex) => {
    const rawSize = RAW_LINE_SIZES[lineIndex] ?? RAW_LINE_SIZES[RAW_LINE_SIZES.length - 1];
    return {
      geometry: buildPrintableLineGeometry(font, line, rawSize, printSafeScale, printSafe).geometry,
      rawSize,
    };
  });
  const rawGeometries = lineResults
    .map((result) => result.geometry)
    .filter((geometry): geometry is THREE.BufferGeometry => geometry !== null);
  if (rawGeometries.length === 0) return null;

  rawGeometries.forEach((geometry, index) => {
    const fallbackSize = lineResults[index]?.rawSize ?? FONT_LINE_HEIGHT;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (bounds) {
      const center = bounds.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, 0);
    }
    const size = getGeometrySize(geometry, fallbackSize);
    if (size.width <= 0 || size.height <= 0) return;

    const widthFactor =
      TEXT_LINE_WIDTH_FACTORS[index] ??
      TEXT_LINE_WIDTH_FACTORS[TEXT_LINE_WIDTH_FACTORS.length - 1];
    let scale = Math.min(
      (fitRadius * widthFactor) / size.width,
      availableBandHeight / size.height,
    );
    let scaledHeight = size.height * scale;
    let centerY = (safeInnerRadius + safeOuterRadius) * 0.5;

    for (let pass = 0; pass < 4; pass += 1) {
      scaledHeight = size.height * scale;
      centerY = safeInnerRadius + scaledHeight * 0.5;
      const yForChord = Math.min(safeOuterRadius, centerY + scaledHeight * 0.5);
      const allowedWidth = Math.max(
        0,
        Math.sqrt(Math.max(0, fitRadius * fitRadius - yForChord * yForChord)) * 2 -
          TEXT_SIDE_MARGIN_MM * 2,
      );
      const scaledWidth = size.width * scale;
      if (allowedWidth > 0 && scaledWidth > allowedWidth) {
        scale *= allowedWidth / scaledWidth;
      }
    }

    scaledHeight = size.height * scale;
    centerY = safeInnerRadius + scaledHeight * 0.5;
    geometry.scale(scale, scale, 1);
    geometry.translate(0, index === 0 ? centerY : -centerY, 0);
  });

  const merged = mergeGeometries(rawGeometries, false);
  rawGeometries.forEach((geometry) => geometry.dispose());
  if (!merged) return null;

  appendPipelineTrace(
    `[engraving] reserved center character layout:support=${supportRadius.toFixed(3)}mm,fit=${fitRadius.toFixed(3)}mm`,
  );
  merged.clearGroups();
  return merged;
}

function buildTextGeometry(
  font: Font,
  seed: number,
  isSeedModified: boolean,
  fitRadius: number,
  printSafeScale = 1,
  printSafe = false,
  reservedCenterRadius = 0,
): THREE.BufferGeometry | null {
  const lines = formatEngravingLines(seed, isSeedModified);
  const lineResults = lines.map((line, index) => ({
    geometry: buildPrintableLineGeometry(
      font,
      line,
      RAW_LINE_SIZES[index] ?? RAW_LINE_SIZES[RAW_LINE_SIZES.length - 1],
      printSafeScale,
      printSafe,
    ),
    rawSize: RAW_LINE_SIZES[index] ?? RAW_LINE_SIZES[RAW_LINE_SIZES.length - 1],
  }));
  const rawGeometries = lineResults
    .map((result) => result.geometry.geometry)
    .filter((geometry): geometry is THREE.BufferGeometry => geometry !== null);
  const removedContours = lineResults.reduce((sum, result) => sum + result.geometry.removedContours, 0);
  const removedHoles = lineResults.reduce((sum, result) => sum + result.geometry.removedHoles, 0);
  appendPipelineTrace(`[engraving] removed contours=${removedContours},removed holes=${removedHoles}`);
  if (rawGeometries.length === 0) return null;

  rawGeometries.forEach((geometry, index) => {
    const widthFactor = TEXT_LINE_WIDTH_FACTORS[index];
    if (widthFactor === undefined) return;
    const targetLineWidth = fitRadius * widthFactor;
    const { width } = getGeometrySize(geometry, lineResults[index]?.rawSize ?? FONT_LINE_HEIGHT);
    if (width > 0) {
      const scale = targetLineWidth / width;
      geometry.scale(scale, scale, 1);
    }
  });

  const referenceLineHeight =
    getGeometrySize(rawGeometries[Math.min(1, rawGeometries.length - 1)], lineResults[Math.min(1, lineResults.length - 1)]?.rawSize ?? FONT_LINE_HEIGHT).height;
  rawGeometries.forEach((geometry, index) => {
    if (index < TEXT_LINE_WIDTH_FACTORS.length) return;
    const { height } = getGeometrySize(geometry, lineResults[index]?.rawSize ?? FONT_LINE_HEIGHT);
    const targetHeight = referenceLineHeight * TEXT_SIGNATURE_HEIGHT_FACTOR;
    if (height > 0 && targetHeight > 0) {
      const scale = targetHeight / height;
      geometry.scale(scale, scale, 1);
    }
  });

  const buildLayoutAroundReservedCenter = (): THREE.BufferGeometry | null => {
    const clearance = Math.min(
      TEXT_RESERVED_CENTER_CLEARANCE_MM,
      Math.max(0.6, fitRadius - reservedCenterRadius - TEXT_SIDE_MARGIN_MM - 1),
    );
    return buildSupportAwareTextGeometry(
      font,
      seed,
      isSeedModified,
      fitRadius,
      printSafeScale,
      printSafe,
      reservedCenterRadius + clearance,
    );
  };

  if (reservedCenterRadius > 0) {
    const reservedLayout = buildLayoutAroundReservedCenter();
    if (reservedLayout) {
      rawGeometries.forEach((geometry) => geometry.dispose());
      return reservedLayout;
    }
    appendPipelineTrace("[engraving] reserved center layout fallback=standard");
  }

  const computeLayout = () => {
    const lineHeights = rawGeometries.map((geometry, index) =>
      getGeometrySize(geometry, lineResults[index]?.rawSize ?? FONT_LINE_HEIGHT).height);
    const maxLineHeight = lineHeights.length > 0 ? Math.max(...lineHeights) : FONT_LINE_HEIGHT;
    const lineGap = Math.max(0.8, maxLineHeight * TEXT_LINE_GAP_FACTOR);
    const totalHeight = lineHeights.reduce((sum, height) => sum + height, 0) + lineGap * Math.max(0, lineHeights.length - 1);
    let currentTop = totalHeight * 0.5;
    const lineCenters = lineHeights.map((lineHeight) => {
      const centerY = currentTop - lineHeight * 0.5;
      currentTop -= lineHeight + lineGap;
      return centerY;
    });
    return { lineCenters };
  };

  const firstLayout = computeLayout();
  rawGeometries.forEach((geometry, index) => {
    const centerY = firstLayout.lineCenters[index] ?? 0;
    const { width } = getGeometrySize(geometry, lineResults[index]?.rawSize ?? FONT_LINE_HEIGHT);
    const halfChord = Math.sqrt(Math.max(0, fitRadius * fitRadius - centerY * centerY));
    const allowedWidth = Math.max(0, halfChord * 2 - TEXT_SIDE_MARGIN_MM * 2);
    if (width > 0 && allowedWidth > 0 && width > allowedWidth) {
      const scale = allowedWidth / width;
      geometry.scale(scale, scale, 1);
    }
  });

  const finalLayout = computeLayout();
  rawGeometries.forEach((geometry, index) => {
    geometry.translate(0, finalLayout.lineCenters[index] ?? 0, 0);
  });

  const merged = mergeGeometries(rawGeometries, false);
  rawGeometries.forEach((geometry) => geometry.dispose());

  if (!merged) return null;
  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) {
    merged.dispose();
    return null;
  }

  const maxHeight = fitRadius * TEXT_MAX_HEIGHT_FACTOR;
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y > maxHeight && size.y > 0) {
    const yScale = maxHeight / size.y;
    merged.scale(1, yScale, 1);
    merged.computeBoundingBox();
  }

  const centeredBounds = merged.boundingBox;
  if (!centeredBounds) {
    merged.dispose();
    return null;
  }
  const center = centeredBounds.getCenter(new THREE.Vector3());
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
    for (const vertex of part.vertices) {
      vertices.push(vertex);
    }
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

interface PlanarTextPolygon {
  contour: THREE.Vector2[];
  holes: THREE.Vector2[][];
}

function buildMirroredUndersideTextPolygons(
  font: Font,
  params: VaseParameters,
  seed: number,
  isSeedModified: boolean,
  fitRadius: number,
): PlanarTextPolygon[] {
  void font;
  void params;
  const numberLine = formatEngravingLines(seed, isSeedModified)[1];
  const digitWidth = 3.35;
  const digitHeight = 6;
  const segmentThickness = 0.9;
  const digitGap = 1;
  const activeSegmentsByDigit: Record<string, string[]> = {
    "0": ["a", "b", "c", "d", "e", "f"],
    "1": ["b", "c"],
    "2": ["a", "b", "g", "e", "d"],
    "3": ["a", "b", "g", "c", "d"],
    "4": ["f", "g", "b", "c"],
    "5": ["a", "f", "g", "c", "d"],
    "6": ["a", "f", "g", "e", "c", "d"],
    "7": ["a", "b", "c"],
    "8": ["a", "b", "c", "d", "e", "f", "g"],
    "9": ["a", "b", "c", "d", "f", "g"],
  };
  const horizontalWidth = digitWidth - segmentThickness * 0.65;
  const verticalHeight = (digitHeight - segmentThickness * 1.15) * 0.5;
  const upperVerticalY = digitHeight * 0.25;
  const lowerVerticalY = -digitHeight * 0.25;
  const segmentRects: Record<string, [number, number, number, number]> = {
    a: [0, digitHeight * 0.5 - segmentThickness * 0.5, horizontalWidth, segmentThickness],
    g: [0, 0, horizontalWidth, segmentThickness],
    d: [0, -digitHeight * 0.5 + segmentThickness * 0.5, horizontalWidth, segmentThickness],
    f: [-digitWidth * 0.5 + segmentThickness * 0.5, upperVerticalY, segmentThickness, verticalHeight],
    b: [digitWidth * 0.5 - segmentThickness * 0.5, upperVerticalY, segmentThickness, verticalHeight],
    e: [-digitWidth * 0.5 + segmentThickness * 0.5, lowerVerticalY, segmentThickness, verticalHeight],
    c: [digitWidth * 0.5 - segmentThickness * 0.5, lowerVerticalY, segmentThickness, verticalHeight],
  };
  const polygons: PlanarTextPolygon[] = [];
  const numberWidth = numberLine.length * digitWidth + Math.max(0, numberLine.length - 1) * digitGap;
  const targetWidth = fitRadius * UNDERSIDE_TEXT_WIDTH_FACTOR - TEXT_SIDE_MARGIN_MM * 2;
  const numberScale = Math.min(targetWidth / numberWidth, (fitRadius * UNDERSIDE_TEXT_MAX_HEIGHT_FACTOR) / digitHeight);
  if (!Number.isFinite(numberScale) || numberScale <= 0) return [];
  const offsetY = fitRadius * UNDERSIDE_TEXT_OFFSET_Y_FACTOR;
  const q = (value: number) => Math.round(value * 10000) / 10000;

  const addRect = (centerX: number, centerY: number, width: number, height: number) => {
    const cx = -centerX;
    const cy = centerY;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    polygons.push({
      contour: [
        new THREE.Vector2(q(cx - halfWidth), q(cy - halfHeight)),
        new THREE.Vector2(q(cx + halfWidth), q(cy - halfHeight)),
        new THREE.Vector2(q(cx + halfWidth), q(cy + halfHeight)),
        new THREE.Vector2(q(cx - halfWidth), q(cy + halfHeight)),
      ],
      holes: [],
    });
  };

  numberLine.split("").forEach((digit, digitIndex) => {
    const segments = activeSegmentsByDigit[digit] ?? [];
    const digitCenterX = -numberWidth * 0.5 + digitWidth * 0.5 + digitIndex * (digitWidth + digitGap);
    for (const segment of segments) {
      const rect = segmentRects[segment];
      if (!rect) continue;
      const [localX, localY, width, height] = rect;
      addRect(
        (digitCenterX + localX) * numberScale,
        localY * numberScale + offsetY,
        width * numberScale,
        height * numberScale,
      );
    }
  });
  appendPipelineTrace(
    `[engraving] underside segment text=${numberLine},width=${(numberWidth * numberScale).toFixed(3)}mm,height=${(digitHeight * numberScale).toFixed(3)}mm,offsetY=${offsetY.toFixed(3)}mm,segments=${polygons.length}`,
  );

  return polygons;
}

function buildUndersideEngravedBottomPatch(
  bottomOuterContour: Float64Array,
  textPolygons: PlanarTextPolygon[],
  depth: number,
): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const sectorCount = bottomOuterContour.length / 2;
  const subSectorCount = Math.max(
    sectorCount * UNDERSIDE_PATCH_ANGULAR_SUBDIVISIONS,
    UNDERSIDE_PATCH_MIN_ANGULAR_SLICES,
  );
  const outerRingOffset = UNDERSIDE_PATCH_RADIAL_STEPS * subSectorCount;
  const layerStride = outerRingOffset + sectorCount;
  const textBounds = textPolygons.map((polygon) =>
    polygon.contour.reduce(
      (bounds, vertex) => ({
        minX: Math.min(bounds.minX, vertex.x),
        maxX: Math.max(bounds.maxX, vertex.x),
        minY: Math.min(bounds.minY, vertex.y),
        maxY: Math.max(bounds.maxY, vertex.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    ));
  const nodeIndex = (zLayer: 0 | 1, subSector: number, radialStep: number) => {
    if (radialStep >= UNDERSIDE_PATCH_RADIAL_STEPS) {
      const wrapped = (subSector + subSectorCount) % subSectorCount;
      return zLayer * layerStride + outerRingOffset + Math.floor((wrapped * sectorCount) / subSectorCount);
    }
    return zLayer * layerStride + radialStep * subSectorCount + (subSector + subSectorCount) % subSectorCount;
  };

  const outerXYAtSubSector = (subSector: number) => {
    const wrapped = (subSector + subSectorCount) % subSectorCount;
    const scaledSector = (wrapped * sectorCount) / subSectorCount;
    const baseSector = Math.floor(scaledSector) % sectorCount;
    const nextBaseSector = (baseSector + 1) % sectorCount;
    const localT = scaledSector - Math.floor(scaledSector);
    const ax = bottomOuterContour[baseSector * 2];
    const ay = bottomOuterContour[baseSector * 2 + 1];
    const bx = bottomOuterContour[nextBaseSector * 2];
    const by = bottomOuterContour[nextBaseSector * 2 + 1];
    return {
      x: ax + (bx - ax) * localT,
      y: ay + (by - ay) * localT,
    };
  };

  const nodeXY = (subSector: number, radialStep: number) => {
    if (radialStep >= UNDERSIDE_PATCH_RADIAL_STEPS) {
      const wrapped = (subSector + subSectorCount) % subSectorCount;
      const baseSector = Math.floor((wrapped * sectorCount) / subSectorCount);
      return {
        x: bottomOuterContour[baseSector * 2],
        y: bottomOuterContour[baseSector * 2 + 1],
      };
    }
    const t = radialStep / UNDERSIDE_PATCH_RADIAL_STEPS;
    const outer = outerXYAtSubSector(subSector);
    return {
      x: outer.x * t,
      y: outer.y * t,
    };
  };

  const getCellCorners = (subSector: number, radialStep: number) => {
    const nextSubSector = (subSector + 1) % subSectorCount;
    return [
      nodeXY(subSector, radialStep),
      nodeXY(nextSubSector, radialStep),
      nodeXY(subSector, radialStep + 1),
      nodeXY(nextSubSector, radialStep + 1),
    ];
  };

  const isTextCell = (subSector: number, radialStep: number) => {
    if (radialStep >= UNDERSIDE_PATCH_RADIAL_STEPS - 1) return false;
    const corners = getCellCorners(subSector, radialStep);
    const cellBounds = corners.reduce(
      (bounds, corner) => ({
        minX: Math.min(bounds.minX, corner.x),
        maxX: Math.max(bounds.maxX, corner.x),
        minY: Math.min(bounds.minY, corner.y),
        maxY: Math.max(bounds.maxY, corner.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    return textBounds.some((bounds) =>
      cellBounds.maxX >= bounds.minX &&
      cellBounds.minX <= bounds.maxX &&
      cellBounds.maxY >= bounds.minY &&
      cellBounds.minY <= bounds.maxY);
  };

  const textCells = Array.from({ length: subSectorCount }, (_, subSector) =>
    Array.from({ length: UNDERSIDE_PATCH_RADIAL_STEPS }, (_, radialStep) =>
      isTextCell(subSector, radialStep)));

  for (const z of [0, depth]) {
    for (let radialStep = 0; radialStep < UNDERSIDE_PATCH_RADIAL_STEPS; radialStep += 1) {
      for (let subSector = 0; subSector < subSectorCount; subSector += 1) {
        const { x, y } = nodeXY(subSector, radialStep);
        vertices.push(x, y, z);
      }
    }
    for (let sector = 0; sector < sectorCount; sector += 1) {
      vertices.push(bottomOuterContour[sector * 2], bottomOuterContour[sector * 2 + 1], z);
    }
  }

  const addQuad = (a: number, b: number, c: number, d: number, flip = false) => {
    if (flip) {
      indices.push(a, c, b, b, c, d);
    } else {
      indices.push(a, b, c, b, d, c);
    }
  };

  for (let subSector = 0; subSector < subSectorCount; subSector += 1) {
    const nextSubSector = (subSector + 1) % subSectorCount;
    for (let radialStep = 0; radialStep < UNDERSIDE_PATCH_RADIAL_STEPS - 1; radialStep += 1) {
      const isPocket = textCells[subSector][radialStep];
      const zLayer = isPocket ? 1 : 0;

      addQuad(
        nodeIndex(zLayer, subSector, radialStep),
        nodeIndex(zLayer, nextSubSector, radialStep),
        nodeIndex(zLayer, subSector, radialStep + 1),
        nodeIndex(zLayer, nextSubSector, radialStep + 1),
      );

      const neighbors = [
        {
          differs: radialStep > 0 && textCells[subSector][radialStep - 1] !== isPocket,
          a: nodeIndex(0, subSector, radialStep),
          b: nodeIndex(0, nextSubSector, radialStep),
          c: nodeIndex(1, subSector, radialStep),
          d: nodeIndex(1, nextSubSector, radialStep),
        },
        {
          differs: textCells[subSector][radialStep + 1] !== isPocket,
          a: nodeIndex(0, subSector, radialStep + 1),
          b: nodeIndex(0, nextSubSector, radialStep + 1),
          c: nodeIndex(1, subSector, radialStep + 1),
          d: nodeIndex(1, nextSubSector, radialStep + 1),
        },
        {
          differs: textCells[(subSector + subSectorCount - 1) % subSectorCount][radialStep] !== isPocket,
          a: nodeIndex(0, subSector, radialStep),
          b: nodeIndex(0, subSector, radialStep + 1),
          c: nodeIndex(1, subSector, radialStep),
          d: nodeIndex(1, subSector, radialStep + 1),
        },
        {
          differs: textCells[nextSubSector][radialStep] !== isPocket,
          a: nodeIndex(0, nextSubSector, radialStep),
          b: nodeIndex(0, nextSubSector, radialStep + 1),
          c: nodeIndex(1, nextSubSector, radialStep),
          d: nodeIndex(1, nextSubSector, radialStep + 1),
        },
      ];

      if (isPocket) {
        for (const neighbor of neighbors) {
          if (neighbor.differs) {
            addQuad(neighbor.a, neighbor.b, neighbor.c, neighbor.d, true);
          }
        }
      }
    }
  }
  for (let sector = 0; sector < sectorCount; sector += 1) {
    const startSubSector = Math.ceil((sector * subSectorCount) / sectorCount);
    const endSubSector = Math.ceil(((sector + 1) * subSectorCount) / sectorCount);
    const outerA = nodeIndex(0, startSubSector, UNDERSIDE_PATCH_RADIAL_STEPS);
    const outerB = nodeIndex(
      0,
      endSubSector,
      UNDERSIDE_PATCH_RADIAL_STEPS,
    );
    const innerEnd = nodeIndex(
      0,
      endSubSector,
      UNDERSIDE_PATCH_RADIAL_STEPS - 1,
    );
    indices.push(outerA, innerEnd, outerB);
    for (let subSector = endSubSector - 1; subSector >= startSubSector; subSector -= 1) {
      const innerCurrent = nodeIndex(0, subSector, UNDERSIDE_PATCH_RADIAL_STEPS - 1);
      const innerNext = nodeIndex(0, subSector + 1, UNDERSIDE_PATCH_RADIAL_STEPS - 1);
      indices.push(outerA, innerCurrent, innerNext);
    }
  }
  appendPipelineTrace(`[engraving] underside radial patch:sectors=${sectorCount},subSectors=${subSectorCount},steps=${UNDERSIDE_PATCH_RADIAL_STEPS}`);

  return removeDegenerateTriangles({
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }, ADDITIVE_TEXT_DEGENERATE_AREA_EPSILON_MM2);
}

function removeFlatUndersideCap(meshData: MeshData): MeshData {
  const indices: number[] = [];
  for (let tri = 0; tri < meshData.indices.length; tri += 3) {
    const a = meshData.indices[tri];
    const b = meshData.indices[tri + 1];
    const c = meshData.indices[tri + 2];
    const allOnUnderside =
      Math.abs(meshData.vertices[a * 3 + 2]) <= BOTTOM_FINISH_PLANE_TOLERANCE_MM &&
      Math.abs(meshData.vertices[b * 3 + 2]) <= BOTTOM_FINISH_PLANE_TOLERANCE_MM &&
      Math.abs(meshData.vertices[c * 3 + 2]) <= BOTTOM_FINISH_PLANE_TOLERANCE_MM;
    if (!allOnUnderside) {
      indices.push(a, b, c);
    }
  }
  return { vertices: meshData.vertices, indices: new Uint32Array(indices) };
}

function engraveUndersideText(
  meshData: MeshData,
  params: VaseParameters,
  bottomOuterContour: Float64Array,
  font: Font,
  seed: number,
  isSeedModified: boolean,
): MeshData | null {
  if (!params.closeBottom) return null;

  const effectiveDepth = Math.min(
    TARGET_UNDERSIDE_ENGRAVING_DEPTH_MM,
    params.bottomThicknessMm - MIN_REMAINING_BOTTOM_MM,
  );
  if (effectiveDepth <= 0) {
    appendPipelineTrace(`[engraving] underside skipped: effective depth=${effectiveDepth.toFixed(3)}mm`);
    return null;
  }

  const fitRadius = computeContourMinRadius(bottomOuterContour) - FIT_MARGIN_MM;
  if (fitRadius <= 8) {
    appendPipelineTrace(`[engraving] underside skipped: fit radius too small (${fitRadius.toFixed(3)}mm)`);
    return null;
  }

  const textPolygons = buildMirroredUndersideTextPolygons(
    font,
    params,
    seed,
    isSeedModified,
    fitRadius,
  );
  if (textPolygons.length === 0) {
    appendPipelineTrace("[engraving] underside skipped: no text polygons");
    return null;
  }

  const engraved = removeDegenerateTriangles(
    combineMeshDataParts([
      removeFlatUndersideCap(meshData),
      buildUndersideEngravedBottomPatch(bottomOuterContour, textPolygons, effectiveDepth),
    ]),
    ADDITIVE_TEXT_DEGENERATE_AREA_EPSILON_MM2,
  );
  const diagnostics = logMeshDiagnostics("[engraving] underside engraved candidate", engraved);
  appendPipelineTrace(
    `[engraving] underside loops:z0=${countBoundaryLoopsAtZ(engraved, 0, BOTTOM_FINISH_PLANE_TOLERANCE_MM)},zDepth=${countBoundaryLoopsAtZ(engraved, effectiveDepth, BOTTOM_FINISH_PLANE_TOLERANCE_MM)}`,
  );

  if (diagnostics.boundaryEdges > 0) {
    appendPipelineTrace(
      `[engraving] underside rejected: boundaryEdges=${diagnostics.boundaryEdges},boundaryLoops=${diagnostics.boundaryLoops}`,
    );
    return null;
  }

  return engraved;
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
  reservedCenterRadius = 0,
): THREE.BufferGeometry | null {
  if (!params.closeBottom) {
    appendPipelineTrace("[engraving] skipped: closeBottom=0");
    return null;
  }

  appendPipelineTrace(
    `[engraving] requested depth=${TARGET_ENGRAVING_DEPTH_MM.toFixed(3)}mm,bottomThickness=${params.bottomThicknessMm.toFixed(3)}mm,minimumRemaining=${MIN_REMAINING_BOTTOM_MM.toFixed(3)}mm,scale=${params.scale.toFixed(3)},printSafe=${params.printSafeEngraving}`,
  );
  const maxSafeDepth = Math.min(
    TARGET_ENGRAVING_DEPTH_MM,
    params.bottomThicknessMm - MIN_REMAINING_BOTTOM_MM,
  );
  let effectiveDepth = maxSafeDepth;
  if (params.printSafeEngraving) {
    effectiveDepth = Math.min(
      Math.max(maxSafeDepth, MIN_ENGRAVING_DEPTH_MM),
      params.bottomThicknessMm - MIN_REMAINING_BOTTOM_MM,
    );
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

  const merged = buildTextGeometry(
    font,
    seed,
    isSeedModified,
    fitRadius,
    compensatedScale,
    params.printSafeEngraving,
    reservedCenterRadius,
  );
  if (!merged) return null;

  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) {
    merged.dispose();
    return null;
  }

  let offsetScale = 1;
  if (params.printSafeEngraving) {
    appendPipelineTrace(`[engraving] applied polygon offset=${OFFSET_DELTA_MM.toFixed(3)}mm`);
  }

  const currentBounds = merged.boundingBox;
  if (!currentBounds) {
    merged.dispose();
    return null;
  }

  const size = currentBounds.getSize(new THREE.Vector3());
  const xyScale = 1;
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
  reservedCenterRadius = 0,
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
  if (reservedCenterRadius > 0) {
    const undersideEngraved = engraveUndersideText(
      meshData,
      params,
      bottomOuterContour,
      font,
      seed,
      isSeedModified,
    );
    if (undersideEngraved) {
      traceMesh("[engraving] after underside subtractive text", undersideEngraved, PLANAR_PATCH_TOLERANCE_MM);
      traceMeshComparison("[engraving] compare underside vs base", meshData, undersideEngraved, PLANAR_PATCH_TOLERANCE_MM, comparisonTimeline);
      summarizeComparisonTimeline(comparisonTimeline);
      return undersideEngraved;
    }

    throw new Error(`La gravure extérieure sous la base n'a pas pu être générée. trace=${getPipelineTrace()}`);
  }

  const additiveTextGeometry = buildAdditiveTextGeometry(
    font,
    params,
    bottomOuterContour,
    seed,
    isSeedModified,
    reservedCenterRadius,
  );
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
