import { useEffect, useMemo, useState, type ReactNode } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import toast from "react-hot-toast";
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import {
  buildSymbolPath,
  EARRING_SYMBOL_FAMILIES,
  EARRING_SYMBOLS_BY_FAMILY,
  GEOMETRIC_BODY_SYMBOL_IDS,
  getDefaultSymbolForFamily,
  getSymbolDefinition,
  isSquareSymbol,
  type EarringSymbolFamilyId,
} from "./silhouetteLibrary";

type EarringBaseShape = "carre" | "triangle" | "rond" | "hexagone" | "polygone" | "coeur";
type EarringMotif = "aucun" | string;
type EarringTexture = "lisse" | "facettes" | "pixel" | "courbes" | "rainures";

type EarringHole = {
  shape: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
};

type EarringSettings = {
  shapeFamily: EarringSymbolFamilyId;
  shapeSymbol: string;
  shape: EarringBaseShape;
  motifFamily: EarringSymbolFamilyId;
  motif: EarringMotif;
  motifCount: number;
  motifScale: number;
  texture: EarringTexture;
  randomMode: boolean;
  exteriorHook: boolean;
};

type EarringDesign = {
  shapeFamily: EarringSymbolFamilyId;
  shapeSymbol: string;
  shape: EarringBaseShape;
  width: number;
  height: number;
  sides: number;
  rotation: number;
  holes: EarringHole[];
  texture: EarringTexture;
  exteriorHook: boolean;
};

const DEFAULT_EARRING_SETTINGS: EarringSettings = {
  shapeFamily: "geometriques",
  shapeSymbol: "rond",
  shape: "rond",
  motifFamily: "geometriques",
  motif: "rond",
  motifCount: 1,
  motifScale: 100,
  texture: "lisse",
  randomMode: true,
  exteriorHook: true,
};

const DEFAULT_EARRING_COLOR = "#f6f6f2";
const MOTIF_EDGE_MARGIN_MM = 2;
const MAX_MOTIF_COUNT = 25;
const SYMBOL_TRACE_SIZE = 192;

type TracedSymbolPoint = {
  x: number;
  y: number;
};

type TracedSymbolPaths = Record<string, TracedSymbolPoint[]>;

type TraceEdge = {
  from: string;
  to: string;
};

type ChoiceSliderOption<T extends string> = {
  id: T;
  label: string;
};

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function isBaseShapeSymbol(symbolId: string): symbolId is EarringBaseShape {
  return GEOMETRIC_BODY_SYMBOL_IDS.includes(symbolId as EarringBaseShape);
}

function normalizeMotifAvailability(settings: EarringSettings): EarringSettings {
  if (settings.shapeFamily !== "geometriques") {
    return {
      ...settings,
      motif: "aucun",
      motifCount: 0,
    };
  }

  return settings;
}

function randomEarringDesign(settings: EarringSettings): EarringDesign {
  const randomShapes = [...GEOMETRIC_BODY_SYMBOL_IDS];
  const randomFamilies = EARRING_SYMBOL_FAMILIES.map((family) => family.id);
  const randomTextures: EarringTexture[] = ["lisse", "facettes", "pixel", "courbes", "rainures"];
  const randomShapeFamily = randomFamilies[randomBetween(0, randomFamilies.length - 1)];
  const randomShapeSymbols = randomShapeFamily === "geometriques"
    ? randomShapes.map((shape) => ({ id: shape }))
    : EARRING_SYMBOLS_BY_FAMILY[randomShapeFamily];
  const randomShapeSymbol = randomShapeSymbols[randomBetween(0, randomShapeSymbols.length - 1)]?.id ?? "rond";
  const canUseMotifs = randomShapeFamily === "geometriques";
  const randomFamily = randomFamilies[randomBetween(0, randomFamilies.length - 1)];
  const randomSymbols = EARRING_SYMBOLS_BY_FAMILY[randomFamily];
  const randomMotif = !canUseMotifs || Math.random() < 0.08 ? "aucun" : randomSymbols[randomBetween(0, randomSymbols.length - 1)]?.id ?? "rond";
  const generatedSettings = settings.randomMode
    ? {
        ...settings,
        shapeFamily: randomShapeFamily,
        shapeSymbol: randomShapeSymbol,
        shape: isBaseShapeSymbol(randomShapeSymbol) ? randomShapeSymbol : "rond",
        motifFamily: randomFamily,
        motif: randomMotif,
        motifCount: randomMotif === "aucun" ? 0 : 1,
        motifScale: randomBetween(72, 100),
        texture: randomTextures[randomBetween(0, randomTextures.length - 1)],
      }
    : settings;
  const printableSettings = normalizeMotifAvailability(generatedSettings);
  const shape = printableSettings.shapeFamily === "geometriques" && isBaseShapeSymbol(printableSettings.shapeSymbol)
    ? printableSettings.shapeSymbol
    : printableSettings.shape;
  const sides = shape === "hexagone" ? 6 : randomBetween(5, 9);
  const isSilhouetteBody = printableSettings.shapeFamily !== "geometriques";
  const width = shape === "coeur" ? randomBetween(38, 48) : isSilhouetteBody ? randomBetween(34, 46) : randomBetween(26, 46);
  const height = shape === "coeur" ? randomBetween(34, 44) : isSilhouetteBody ? randomBetween(34, 46) : randomBetween(32, 56);
  const rotation = randomBetween(-12, 12);

  return {
    shapeFamily: printableSettings.shapeFamily,
    shapeSymbol: printableSettings.shapeSymbol,
    shape,
    width,
    height,
    sides,
    rotation,
    holes: buildEarringHoles(width, height, shape, sides, rotation, printableSettings),
    texture: printableSettings.texture,
    exteriorHook: printableSettings.exteriorHook,
  };
}

function getShapeLabel(shape: EarringBaseShape): string {
  return {
    carre: "Carre",
    triangle: "Triangle",
    rond: "Rond",
    hexagone: "Hexagone",
    polygone: "Polygone",
    coeur: "Coeur",
  }[shape];
}

function getHoleLabel(shape: string): string {
  return getSymbolDefinition(shape).pluralLabel;
}

function getTextureLabel(texture: EarringTexture): string {
  return {
    lisse: "Lisse",
    facettes: "Facettes",
    pixel: "Pixel",
    courbes: "Courbes",
    rainures: "Rainures",
  }[texture];
}

function loadSilhouetteImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger la silhouette ${src}`));
    image.src = src;
  });
}

function getPixelLuminance(data: Uint8ClampedArray, index: number): number {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function tracePointKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseTracePoint(key: string): TracedSymbolPoint {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function simplifyOrthogonalTrace(points: TracedSymbolPoint[]): TracedSymbolPoint[] {
  if (points.length < 3) return points;

  const simplified: TracedSymbolPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const sameHorizontal = previous.y === current.y && current.y === next.y;
    const sameVertical = previous.x === current.x && current.x === next.x;
    if (!sameHorizontal && !sameVertical) simplified.push(current);
  }

  return simplified;
}

function traceMaskToPoints(mask: Uint8Array, width: number, height: number): TracedSymbolPoint[] {
  const visited = new Uint8Array(width * height);
  let bestComponent: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    const component: number[] = [];
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];

      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      });
    }

    if (component.length > bestComponent.length) bestComponent = component;
  }

  if (bestComponent.length < 12) return [];

  const componentSet = new Set(bestComponent);
  const edges: TraceEdge[] = [];
  bestComponent.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const top = y === 0 || !componentSet.has(index - width);
    const right = x === width - 1 || !componentSet.has(index + 1);
    const bottom = y === height - 1 || !componentSet.has(index + width);
    const left = x === 0 || !componentSet.has(index - 1);

    if (top) edges.push({ from: tracePointKey(x, y), to: tracePointKey(x + 1, y) });
    if (right) edges.push({ from: tracePointKey(x + 1, y), to: tracePointKey(x + 1, y + 1) });
    if (bottom) edges.push({ from: tracePointKey(x + 1, y + 1), to: tracePointKey(x, y + 1) });
    if (left) edges.push({ from: tracePointKey(x, y + 1), to: tracePointKey(x, y) });
  });

  const edgeMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    edgeMap.set(edge.from, [...(edgeMap.get(edge.from) ?? []), edge.to]);
  });

  const start = [...edgeMap.keys()]
    .map(parseTracePoint)
    .sort((a, b) => a.y - b.y || a.x - b.x)[0];
  if (!start) return [];

  const startKey = tracePointKey(start.x, start.y);
  const outline: TracedSymbolPoint[] = [];
  const usedEdges = new Set<string>();
  let currentKey = startKey;

  for (let guard = 0; guard < edges.length + 4; guard += 1) {
    outline.push(parseTracePoint(currentKey));
    const nextCandidates = edgeMap.get(currentKey) ?? [];
    const nextKey = nextCandidates.find((candidate) => !usedEdges.has(`${currentKey}->${candidate}`));
    if (!nextKey) break;

    usedEdges.add(`${currentKey}->${nextKey}`);
    currentKey = nextKey;
    if (currentKey === startKey) break;
  }

  if (outline.length < 12) return [];
  const simplifiedOutline = simplifyOrthogonalTrace(outline);
  const minX = Math.min(...simplifiedOutline.map((point) => point.x));
  const maxX = Math.max(...simplifiedOutline.map((point) => point.x));
  const minY = Math.min(...simplifiedOutline.map((point) => point.y));
  const maxY = Math.max(...simplifiedOutline.map((point) => point.y));
  const scale = Math.max(maxX - minX, maxY - minY, 1);
  const normalizedCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  return simplifiedOutline.map((point) => ({
    x: Number(((point.x - normalizedCenter.x) / scale).toFixed(4)),
    y: Number(((point.y - normalizedCenter.y) / scale).toFixed(4)),
  }));
}

async function traceSilhouetteSource(source: string): Promise<TracedSymbolPoint[]> {
  const image = await loadSilhouetteImage(`${import.meta.env.BASE_URL}${source}`);
  const canvas = document.createElement("canvas");
  canvas.width = SYMBOL_TRACE_SIZE;
  canvas.height = SYMBOL_TRACE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, SYMBOL_TRACE_SIZE, SYMBOL_TRACE_SIZE);
  const ratio = Math.min(SYMBOL_TRACE_SIZE / image.naturalWidth, SYMBOL_TRACE_SIZE / image.naturalHeight) * 0.92;
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  context.drawImage(image, (SYMBOL_TRACE_SIZE - drawWidth) / 2, (SYMBOL_TRACE_SIZE - drawHeight) / 2, drawWidth, drawHeight);

  const imageData = context.getImageData(0, 0, SYMBOL_TRACE_SIZE, SYMBOL_TRACE_SIZE);
  const data = imageData.data;
  const cornerIndexes = [0, SYMBOL_TRACE_SIZE - 1, SYMBOL_TRACE_SIZE * (SYMBOL_TRACE_SIZE - 1), SYMBOL_TRACE_SIZE * SYMBOL_TRACE_SIZE - 1].map((index) => index * 4);
  const background = cornerIndexes.reduce((sum, index) => sum + getPixelLuminance(data, index), 0) / cornerIndexes.length;
  const mask = new Uint8Array(SYMBOL_TRACE_SIZE * SYMBOL_TRACE_SIZE);
  let foregroundCount = 0;

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const index = pixel * 4;
    const alpha = data[index + 3];
    const luminance = getPixelLuminance(data, index);
    const differsFromBackground = Math.abs(luminance - background) > 20;
    const darkOnLight = background > 128 && luminance < background - 14;
    const lightOnDark = background <= 128 && luminance > background + 14;
    if (alpha > 24 && (alpha < 248 || differsFromBackground || darkOnLight || lightOnDark)) {
      mask[pixel] = 1;
      foregroundCount += 1;
    }
  }

  if (foregroundCount < 20) {
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      const index = pixel * 4;
      mask[pixel] = data[index + 3] > 48 && getPixelLuminance(data, index) < 245 ? 1 : 0;
    }
  }

  return traceMaskToPoints(mask, SYMBOL_TRACE_SIZE, SYMBOL_TRACE_SIZE);
}

function buildTracedSymbolPath(points: TracedSymbolPoint[], cx: number, cy: number, size: number, rotation = 0): string {
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pathPoints = points.map((point) => {
    const x = point.x * size;
    const y = point.y * size;
    return `${(cx + x * cos - y * sin).toFixed(2)} ${(cy + x * sin + y * cos).toFixed(2)}`;
  });
  return `M ${pathPoints.join(" L ")} Z`;
}

function buildSymbolOrTracePath(symbolId: string, cx: number, cy: number, size: number, rotation: number, tracedSymbolPaths: TracedSymbolPaths): string {
  const tracedPath = tracedSymbolPaths[symbolId];
  if (tracedPath?.length) return buildTracedSymbolPath(tracedPath, cx, cy, size, rotation);
  return buildSymbolPath(symbolId, cx, cy, size, rotation);
}

function getSafeCenteredMotif(width: number, height: number, shape: EarringBaseShape) {
  const baseSize = Math.min(width, height) * 0.5;
  const shapeScale: Record<EarringBaseShape, number> = {
    carre: 1,
    triangle: 0.76,
    rond: 1,
    hexagone: 0.96,
    polygone: 0.94,
    coeur: 0.82,
  };
  return { x: 35, y: 43, size: Number((baseSize * shapeScale[shape]).toFixed(2)) };
}

function isMotifPrintablePosition(shape: EarringBaseShape, width: number, height: number, x: number, y: number, size: number): boolean {
  const cx = 35;
  const cy = 42;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const margin = size / 2 + MOTIF_EDGE_MARGIN_MM;
  const top = cy - halfHeight;
  const bottom = cy + halfHeight;
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);

  if (y < top + margin || y > bottom - margin) return false;

  if (shape === "carre") return dx <= halfWidth - margin && dy <= halfHeight - margin;
  if (shape === "triangle") {
    const progress = Math.max(0, Math.min(1, (y - top) / height));
    return dx <= halfWidth * progress - margin;
  }
  if (shape === "rond") {
    const rx = Math.max(1, halfWidth - margin);
    const ry = Math.max(1, halfHeight - margin);
    return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
  }
  if (shape === "coeur") {
    const upperSafe = y > top + height * 0.2 || dx < halfWidth * 0.38;
    const lowerTaper = y < cy ? halfWidth : Math.max(margin, halfWidth * (1 - ((y - cy) / halfHeight) * 0.86));
    return upperSafe && dx <= lowerTaper - margin;
  }

  const rx = Math.max(1, halfWidth - margin);
  const ry = Math.max(1, halfHeight - margin);
  return (dx / rx) ** 2 + (dy / ry) ** 2 <= 0.92;
}

function getMaxPrintableMotifSize(
  width: number,
  height: number,
  shape: EarringBaseShape,
  sides: number,
  rotation: number,
  motif: string,
  x: number,
  y: number,
): number {
  let min = 2.2;
  let max = Math.min(width, height) - MOTIF_EDGE_MARGIN_MM * 2;

  for (let index = 0; index < 18; index += 1) {
    const candidate = (min + max) / 2;
    const hole: EarringHole = {
      shape: motif,
      x,
      y,
      size: candidate,
      rotation: isSquareSymbol(motif) ? 45 : 0,
    };
    if (
      isMotifPrintablePosition(shape, width, height, x, y, candidate)
      && isHolePrintableInShape(width, height, shape, sides, rotation, hole)
    ) {
      min = candidate;
    } else {
      max = candidate;
    }
  }

  return Number(min.toFixed(2));
}

function getPrintableMotifSize(
  width: number,
  height: number,
  shape: EarringBaseShape,
  sides: number,
  rotation: number,
  settings: EarringSettings,
): number {
  if (settings.motif === "aucun") return 0;

  const count = Math.max(1, settings.motifCount);
  const center = getSafeCenteredMotif(width, height, shape);
  const maxSingle = getMaxPrintableMotifSize(width, height, shape, sides, rotation, settings.motif, center.x, center.y);
  const countScale = count === 1 ? 1 : Math.max(0.36, 1 / Math.sqrt(count));
  const requestedScale = Math.max(25, Math.min(100, settings.motifScale)) / 100;
  return Number(Math.max(2.2, maxSingle * countScale * requestedScale).toFixed(2));
}

function buildConcentricMotifs(
  count: number,
  width: number,
  height: number,
  shape: EarringBaseShape,
  sides: number,
  rotation: number,
  motif: string,
  size: number,
): Array<{ x: number; y: number }> {
  if (count === 1) return [{ x: 35, y: 43 }];

  const center = { x: 35, y: 43 };
  const ringRadiusX = Math.max(size + 2.4, width * 0.22);
  const ringRadiusY = Math.max(size + 2.2, height * 0.2);
  const ringTwoRadiusX = Math.max(ringRadiusX + size + 2.8, width * 0.34);
  const ringTwoRadiusY = Math.max(ringRadiusY + size + 2.6, height * 0.31);
  const ringThreeRadiusX = Math.max(ringTwoRadiusX + size + 2.4, width * 0.44);
  const ringThreeRadiusY = Math.max(ringTwoRadiusY + size + 2.2, height * 0.4);
  const candidates: Array<{ x: number; y: number }> = [];
  const addRing = (points: number, radiusX: number, radiusY: number, angleOffset: number) => {
    for (let index = 0; index < points; index += 1) {
      const angle = angleOffset + (Math.PI * 2 * index) / points;
      const x = center.x + Math.cos(angle) * radiusX;
      const y = center.y + Math.sin(angle) * radiusY - radiusY * 0.08;
      candidates.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
    }
  };

  candidates.push(center);
  addRing(Math.min(8, Math.max(3, count - 1)), ringRadiusX, ringRadiusY, -Math.PI / 2);
  addRing(10, ringTwoRadiusX, ringTwoRadiusY, -Math.PI / 2 + Math.PI / 10);
  addRing(14, ringThreeRadiusX, ringThreeRadiusY, -Math.PI / 2 + Math.PI / 14);

  const printable = candidates
    .filter((candidate) => {
      const hole: EarringHole = {
        shape: motif,
        x: candidate.x,
        y: candidate.y,
        size,
        rotation: isSquareSymbol(motif) ? 45 : 0,
      };
      return (
        isMotifPrintablePosition(shape, width, height, candidate.x, candidate.y, size)
        && isHolePrintableInShape(width, height, shape, sides, rotation, hole)
      );
    })
    .filter((candidate, index, all) => all.findIndex((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < size + 1.8) === index)
    .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
    .slice(0, count);

  return printable;
}

function buildEarringHoles(
  width: number,
  height: number,
  shape: EarringBaseShape,
  sides: number,
  rotation: number,
  settings: EarringSettings,
): EarringHole[] {
  if (settings.motif === "aucun" || settings.motifCount <= 0) return [];

  const count = Math.max(1, Math.min(MAX_MOTIF_COUNT, settings.motifCount));
  let size = getPrintableMotifSize(width, height, shape, sides, rotation, settings);
  const motif = settings.motif;

  if (count === 1) {
    const centeredMotif = getSafeCenteredMotif(width, height, shape);
    return [{
      shape: motif,
      x: centeredMotif.x,
      y: centeredMotif.y,
      size,
      rotation: isSquareSymbol(motif) ? 45 : 0,
    }];
  }

  let positions = buildConcentricMotifs(count, width, height, shape, sides, rotation, motif, size);
  for (let attempt = 0; positions.length < count && attempt < 10 && size > 2.2; attempt += 1) {
    size = Number(Math.max(2.2, size * 0.88).toFixed(2));
    positions = buildConcentricMotifs(count, width, height, shape, sides, rotation, motif, size);
  }

  return positions.map((position, index) => ({
    shape: motif,
    x: position.x,
    y: position.y,
    size,
    rotation: isSquareSymbol(motif) ? 45 : index % 2 === 0 ? 0 : 18,
  }));
}

function buildPolygonPath(width: number, height: number, sides: number, rotation = -90): string {
  const cx = 35;
  const cy = 42;
  const rx = width / 2;
  const ry = height / 2;
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = ((360 / sides) * index + rotation) * (Math.PI / 180);
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
  });
  return `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
}

function buildBaseHeartPath(cx: number, cy: number, width: number, height: number): string {
  const samples = Array.from({ length: 96 }, (_, index) => {
    const t = Math.PI + (index / 95) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x, y };
  });
  const minX = Math.min(...samples.map((point) => point.x));
  const maxX = Math.max(...samples.map((point) => point.x));
  const minY = Math.min(...samples.map((point) => point.y));
  const maxY = Math.max(...samples.map((point) => point.y));
  const points = samples.map((point) => {
    const normalizedX = (point.x - minX) / (maxX - minX);
    const normalizedY = (maxY - point.y) / (maxY - minY);
    return [
      cx - width / 2 + normalizedX * width,
      cy - height / 2 + normalizedY * height,
    ];
  });
  return `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
}

function buildEarringPath(design: EarringDesign, tracedSymbolPaths: TracedSymbolPaths = {}): string {
  const cx = 35;
  const cy = 42;
  if (design.shapeFamily !== "geometriques") {
    const size = Math.min(design.width, design.height);
    return buildSymbolOrTracePath(design.shapeSymbol, cx, cy, size, design.rotation, tracedSymbolPaths);
  }

  const halfWidth = design.width / 2;
  const halfHeight = design.height / 2;
  const left = cx - halfWidth;
  const right = cx + halfWidth;
  const top = cy - halfHeight;
  const bottom = cy + halfHeight;

  if (design.shape === "rond") return [`M ${cx} ${top}`, `A ${halfWidth} ${halfHeight} 0 1 1 ${cx} ${bottom}`, `A ${halfWidth} ${halfHeight} 0 1 1 ${cx} ${top}`, "Z"].join(" ");
  if (design.shape === "carre") {
    const radius = Math.min(5, halfWidth * 0.25, halfHeight * 0.25);
    return [`M ${left + radius} ${top}`, `L ${right - radius} ${top}`, `Q ${right} ${top} ${right} ${top + radius}`, `L ${right} ${bottom - radius}`, `Q ${right} ${bottom} ${right - radius} ${bottom}`, `L ${left + radius} ${bottom}`, `Q ${left} ${bottom} ${left} ${bottom - radius}`, `L ${left} ${top + radius}`, `Q ${left} ${top} ${left + radius} ${top}`, "Z"].join(" ");
  }
  if (design.shape === "triangle") return `M ${cx} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
  if (design.shape === "coeur") return buildBaseHeartPath(cx, cy, design.width, design.height);
  return buildPolygonPath(design.width, design.height, design.sides, -90 + design.rotation);
}

function getBodyHalfWidthAtOffset(design: EarringDesign, offsetFromTop: number): number {
  const halfWidth = design.width / 2;
  const halfHeight = design.height / 2;
  const progress = Math.max(0, Math.min(1, offsetFromTop / Math.max(1, design.height)));
  if (design.shape === "triangle") return Math.max(1.8, halfWidth * progress);
  if (design.shape === "hexagone" || design.shape === "polygone") return Math.max(2.2, halfWidth * Math.min(1, progress * 2.6));
  if (design.shape === "coeur") return Math.max(2.4, halfWidth * Math.min(1, 0.25 + progress * 2.2));
  if (design.shape === "rond") {
    const normalized = Math.max(0, Math.min(1, offsetFromTop / halfHeight));
    return Math.max(2.8, halfWidth * Math.sin((normalized * Math.PI) / 2) * 0.72);
  }
  return Math.max(3, halfWidth * 0.42);
}

function getHookLayout(design: EarringDesign) {
  const bodyHoleY = 42 - design.height / 2 + 5;
  const topY = 42 - design.height / 2;
  const hookX = 35;
  const hookY = design.exteriorHook ? topY - (design.shape === "coeur" ? 4.4 : 3) : bodyHoleY;
  const hookOuterRadius = design.exteriorHook ? design.shape === "coeur" ? 3.25 : 3 : 1;
  const hookNeckTop = hookY + hookOuterRadius * 0.42;
  const hookShoulderY = topY + Math.min(9, Math.max(5.6, design.height * 0.16));
  const hookShoulderHalfWidth = Math.max(3.2, getBodyHalfWidthAtOffset(design, hookShoulderY - topY));
  const hookNeckHalfWidth = 2.15;
  const hookTransitionPath = design.shape === "coeur"
    ? [
        `M ${hookX - hookNeckHalfWidth} ${hookNeckTop}`,
        `C ${hookX - 3.15} ${topY + 0.3}, ${hookX - design.width * 0.1} ${topY + 1.9}, ${hookX - design.width * 0.14} ${topY + design.height * 0.18}`,
        `C ${hookX - design.width * 0.1} ${topY + design.height * 0.16}, ${hookX - 3.05} ${topY + design.height * 0.24}, ${hookX - 1.28} ${topY + design.height * 0.45}`,
        `C ${hookX - 1.1} ${topY + design.height * 0.33}, ${hookX - 1.02} ${topY + design.height * 0.15}, ${hookX - 0.48} ${topY + design.height * 0.07}`,
        `C ${hookX - 0.74} ${hookNeckTop + 1.22}, ${hookX - 0.34} ${hookNeckTop + 1.58}, ${hookX} ${hookNeckTop + 1.66}`,
        `C ${hookX + 0.34} ${hookNeckTop + 1.58}, ${hookX + 0.74} ${hookNeckTop + 1.22}, ${hookX + 0.48} ${topY + design.height * 0.07}`,
        `C ${hookX + 1.02} ${topY + design.height * 0.15}, ${hookX + 1.1} ${topY + design.height * 0.33}, ${hookX + 1.28} ${topY + design.height * 0.45}`,
        `C ${hookX + 3.05} ${topY + design.height * 0.24}, ${hookX + design.width * 0.1} ${topY + design.height * 0.16}, ${hookX + design.width * 0.14} ${topY + design.height * 0.18}`,
        `C ${hookX + design.width * 0.1} ${topY + 1.9}, ${hookX + 3.15} ${topY + 0.3}, ${hookX + hookNeckHalfWidth} ${hookNeckTop}`,
        `Q ${hookX} ${hookNeckTop + 0.92} ${hookX - hookNeckHalfWidth} ${hookNeckTop}`,
        "Z",
      ].join(" ")
    : [
        `M ${hookX - hookNeckHalfWidth} ${hookNeckTop}`,
        `C ${hookX - hookNeckHalfWidth} ${topY - 0.8}, ${hookX - hookShoulderHalfWidth * 0.52} ${topY + 2.2}, ${hookX - hookShoulderHalfWidth} ${hookShoulderY}`,
        `L ${hookX + hookShoulderHalfWidth} ${hookShoulderY}`,
        `C ${hookX + hookShoulderHalfWidth * 0.52} ${topY + 2.2}, ${hookX + hookNeckHalfWidth} ${topY - 0.8}, ${hookX + hookNeckHalfWidth} ${hookNeckTop}`,
        `Q ${hookX} ${hookNeckTop + 1.25} ${hookX - hookNeckHalfWidth} ${hookNeckTop}`,
        "Z",
      ].join(" ");

  return {
    bodyHoleY,
    hookOuterRadius,
    hookTransitionPath,
    hookX,
    hookY,
  };
}

function buildHolePath(hole: EarringHole, tracedSymbolPaths: TracedSymbolPaths = {}): string {
  return buildSymbolOrTracePath(hole.shape, hole.x, hole.y, hole.size, hole.rotation, tracedSymbolPaths);
}

function parseSvgShapes(path: string): THREE.Shape[] {
  const loader = new SVGLoader();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}" /></svg>`;
  return loader.parse(svg).paths.flatMap((svgPath) => SVGLoader.createShapes(svgPath));
}

function isPointInsidePolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getPathSamplePoints(path: string, divisions = 36): THREE.Vector2[] {
  return parseSvgShapes(path).flatMap((shape) => shape.getPoints(divisions));
}

function isPointInsideAnyPolygon(point: THREE.Vector2, polygons: THREE.Vector2[][]): boolean {
  return polygons.some((polygon) => isPointInsidePolygon(point, polygon));
}

function isHolePathInsideBasePath(basePath: string, holePath: string, center: THREE.Vector2): boolean {
  const basePolygons = parseSvgShapes(basePath).map((shape) => shape.getPoints(64));
  const holePoints = [center, ...getPathSamplePoints(holePath, 48)];
  return holePoints.every((point) => isPointInsideAnyPolygon(point, basePolygons));
}

function isHolePrintableInShape(
  width: number,
  height: number,
  shape: EarringBaseShape,
  sides: number,
  rotation: number,
  hole: EarringHole,
): boolean {
  const baseDesign: EarringDesign = {
    shapeFamily: "geometriques",
    shapeSymbol: shape,
    shape,
    width,
    height,
    sides,
    rotation,
    holes: [],
    texture: "lisse",
    exteriorHook: true,
  };
  const expandedHole: EarringHole = {
    ...hole,
    size: hole.size + MOTIF_EDGE_MARGIN_MM * 2,
  };
  const expandedHolePath = buildHolePath(expandedHole);
  return isHolePathInsideBasePath(buildEarringPath(baseDesign), expandedHolePath, new THREE.Vector2(hole.x, hole.y));
}

function prepareEarringGeometry(geometry: THREE.BufferGeometry) {
  geometry.translate(-35, -42, 0);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createExtrudedGeometry(path: string, holePaths: string[], thickness: number) {
  const geometry = createSolidExtrudedGeometry(path, thickness);
  return subtractHolePathsFromGeometry(geometry, holePaths, thickness);
}

function createSolidExtrudedGeometry(path: string, thickness: number, bevelSize = 0.18) {
  return prepareEarringGeometry(new THREE.ExtrudeGeometry(parseSvgShapes(path), {
    depth: thickness,
    bevelEnabled: bevelSize > 0,
    bevelSegments: bevelSize > 0 ? 1 : 0,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 28,
    steps: 1,
  }));
}

function createCuttingGeometry(path: string, thickness: number) {
  const geometry = createSolidExtrudedGeometry(path, thickness + 4, 0);
  geometry.translate(0, -1, 0);
  return geometry;
}

function subtractHolePathsFromGeometry(geometry: THREE.BufferGeometry, holePaths: string[], thickness: number): THREE.BufferGeometry {
  if (holePaths.length === 0) return geometry;

  const evaluator = new Evaluator();
  let result = new Brush(geometry);
  result.updateMatrixWorld();

  holePaths.forEach((holePath) => {
    const cutter = new Brush(createCuttingGeometry(holePath, thickness));
    cutter.updateMatrixWorld();
    result = evaluator.evaluate(result, cutter, SUBTRACTION);
    result.updateMatrixWorld();
  });

  return result.geometry;
}

function createHookTransitionGeometry(path: string, holePaths: string[], thickness: number) {
  const transitionGeometry = createSolidExtrudedGeometry(path, thickness);
  const cutGeometry = subtractHolePathsFromGeometry(transitionGeometry, holePaths, thickness);
  cutGeometry.computeVertexNormals();
  cutGeometry.computeBoundingBox();
  cutGeometry.computeBoundingSphere();
  return cutGeometry;
}

function createHookRingGeometry(x: number, y: number, outerRadius: number, innerRadius: number, thickness: number) {
  const outer = new THREE.Shape();
  outer.absarc(x, y, outerRadius, 0, Math.PI * 2, false);

  const inner = new THREE.Path();
  inner.absarc(x, y, innerRadius, 0, Math.PI * 2, true);
  outer.holes.push(inner);

  return prepareEarringGeometry(new THREE.ExtrudeGeometry(outer, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.16,
    bevelThickness: 0.16,
    curveSegments: 36,
    steps: 1,
  }));
}

type EarringViewer3DProps = {
  color: string;
  design: EarringDesign;
  shapePath: string;
  holePaths: string[];
  bodyHoleY: number;
  hookTransitionPath: string;
  hookX: number;
  hookY: number;
  hookOuterRadius: number;
  thickness: number;
};

function EarringPair3D({
  color,
  design,
  shapePath,
  holePaths,
  bodyHoleY,
  hookTransitionPath,
  hookX,
  hookY,
  hookOuterRadius,
  thickness,
}: EarringViewer3DProps) {
  const geometries = useMemo(() => {
    const bodyHolePaths = design.exteriorHook
      ? holePaths
      : [...holePaths, [`M 35 ${bodyHoleY - 1}`, `A 1 1 0 1 1 35 ${bodyHoleY + 1}`, `A 1 1 0 1 1 35 ${bodyHoleY - 1}`, "Z"].join(" ")];

    return {
      body: createExtrudedGeometry(shapePath, bodyHolePaths, thickness),
      transition: design.exteriorHook ? createHookTransitionGeometry(hookTransitionPath, holePaths, thickness) : null,
      ring: design.exteriorHook ? createHookRingGeometry(hookX, hookY, hookOuterRadius, 1, thickness) : null,
    };
  }, [bodyHoleY, design.exteriorHook, holePaths, hookOuterRadius, hookTransitionPath, hookX, hookY, shapePath, thickness]);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.02,
  }), [color]);

  const edgeMaterial = useMemo(() => new THREE.LineBasicMaterial({
    color: "#d7d0b8",
    transparent: true,
    opacity: 0.34,
  }), []);

  const renderEarring = (mirror: boolean) => (
    <group
      key={mirror ? "right" : "left"}
      position={[mirror ? 26 : -26, 0.02, 0]}
      scale={[mirror ? -1 : 1, 1, 1]}
      rotation={[0, mirror ? -0.08 : 0.08, 0]}
    >
      <mesh geometry={geometries.body} material={material} castShadow receiveShadow />
      <lineSegments geometry={new THREE.EdgesGeometry(geometries.body, 28)} material={edgeMaterial} />
      {geometries.transition && <mesh geometry={geometries.transition} material={material} castShadow receiveShadow />}
      {geometries.ring && <mesh geometry={geometries.ring} material={material} castShadow receiveShadow />}
      {geometries.ring && <lineSegments geometry={new THREE.EdgesGeometry(geometries.ring, 28)} material={edgeMaterial} />}
    </group>
  );

  return (
    <group rotation={[0, 0.08, 0]}>
      {renderEarring(false)}
      {renderEarring(true)}
    </group>
  );
}

function EarringViewer3D(props: EarringViewer3DProps) {
  return (
    <Canvas
      camera={{ position: [84, 72, -92], fov: 42, near: 0.1, far: 800 }}
      shadows
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      style={{ background: "#202020" }}
    >
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#ffffff", "#4b4b4b", 0.68]} />
      <directionalLight
        position={[42, 70, 52]}
        intensity={2.1}
        castShadow
        shadow-bias={-0.0005}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color="#b9b9b2" roughness={0.82} />
      </mesh>
      <gridHelper args={[240, 120, "#8f8f8a", "#a9a9a2"]} position={[0, 0.012, 0]} />

      <EarringPair3D {...props} />

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        enablePan
        enableRotate
        enableZoom
        minDistance={42}
        maxDistance={210}
        target={[0, 0.8, 0]}
      />
    </Canvas>
  );
}

type EarringSchematicViewProps = {
  title: string;
  children: ReactNode;
};

function EarringSchematicView({ title, children }: EarringSchematicViewProps) {
  return (
    <div className="view-2d earring-schematic-view">
      <div className="view-2d-title">{title}</div>
      {children}
    </div>
  );
}

function EarringSilhouetteView({
  bodyHoleY,
  design,
  holePaths,
  hookOuterRadius,
  hookTransitionPath,
  hookX,
  hookY,
  shapePath,
}: {
  bodyHoleY: number;
  design: EarringDesign;
  holePaths: string[];
  hookOuterRadius: number;
  hookTransitionPath: string;
  hookX: number;
  hookY: number;
  shapePath: string;
}) {
  return (
    <EarringSchematicView title="Silhouette">
      <svg viewBox="0 -10 70 96" role="img" aria-label="Silhouette de face de la boucle">
        <defs>
          <mask id="earring-silhouette-mask">
            <rect x="-8" y="-12" width="86" height="108" fill="#ffffff" />
            {!design.exteriorHook && <circle cx="35" cy={bodyHoleY} r="1" fill="#000000" />}
            {holePaths.map((holePath, index) => <path key={index} d={holePath} fill="#000000" />)}
          </mask>
        </defs>
        {design.exteriorHook && (
          <>
            <path d={hookTransitionPath} fill="color-mix(in srgb, var(--color-accent) 18%, var(--color-field))" mask="url(#earring-silhouette-mask)" stroke="var(--color-accent)" strokeWidth="0.35" />
            <circle cx={hookX} cy={hookY} r={hookOuterRadius} fill="color-mix(in srgb, var(--color-accent) 18%, var(--color-field))" stroke="var(--color-accent)" strokeWidth="0.45" />
            <circle cx={hookX} cy={hookY} r="1" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="0.3" />
          </>
        )}
        <path d={shapePath} fill="color-mix(in srgb, var(--color-accent) 12%, var(--color-field))" mask="url(#earring-silhouette-mask)" stroke="var(--color-accent)" strokeWidth="0.65" />
        <path d={shapePath} fill="none" stroke="color-mix(in srgb, var(--color-fg) 36%, transparent)" strokeWidth="0.25" />
      </svg>
    </EarringSchematicView>
  );
}

function EarringTopView({ design, thickness }: { design: EarringDesign; thickness: number }) {
  const viewWidth = Math.max(24, design.width);
  const x = 35 - viewWidth / 2;
  const y = 29;
  const radius = Math.min(2.6, thickness * 0.75);

  return (
    <EarringSchematicView title="Vue de haut">
      <svg viewBox="0 0 70 58" role="img" aria-label="Vue de haut de la boucle">
        <rect
          x={x}
          y={y}
          width={viewWidth}
          height={thickness}
          rx={radius}
          fill="color-mix(in srgb, var(--color-accent) 12%, var(--color-field))"
          stroke="var(--color-accent)"
          strokeWidth="0.55"
        />
        <line x1={x} x2={x + viewWidth} y1={y + thickness + 6} y2={y + thickness + 6} stroke="color-mix(in srgb, var(--color-fg) 22%, transparent)" strokeWidth="0.45" />
        <line x1={x} x2={x} y1={y + thickness + 3.5} y2={y + thickness + 8.5} stroke="color-mix(in srgb, var(--color-fg) 42%, transparent)" strokeWidth="0.45" />
        <line x1={x + viewWidth} x2={x + viewWidth} y1={y + thickness + 3.5} y2={y + thickness + 8.5} stroke="color-mix(in srgb, var(--color-fg) 42%, transparent)" strokeWidth="0.45" />
        <text x="35" y="51" textAnchor="middle">{design.width} x {design.height} x {thickness} mm</text>
      </svg>
    </EarringSchematicView>
  );
}

type EarringWorkshopProps = {
  onBack: () => void;
};

function ChoiceSlider<T extends string>({
  disabled = false,
  id,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: T) => void;
  options: Array<ChoiceSliderOption<T>>;
  value: T;
}) {
  const currentIndex = Math.max(0, options.findIndex((option) => option.id === value));
  const currentOption = options[currentIndex] ?? options[0];

  return (
    <div className="earring-choice-control">
      <div className="earring-slider-header">
        <label htmlFor={id}>{label}</label>
        <strong>{currentOption?.label ?? "-"}</strong>
      </div>
      <input
        id={id}
        type="range"
        min="0"
        max={Math.max(0, options.length - 1)}
        step="1"
        value={currentIndex}
        disabled={disabled || options.length <= 1}
        onChange={(event) => {
          const option = options[Number(event.target.value)];
          if (option) onChange(option.id);
        }}
      />
    </div>
  );
}

export function EarringWorkshop({ onBack }: EarringWorkshopProps) {
  const [settings, setSettings] = useState<EarringSettings>(DEFAULT_EARRING_SETTINGS);
  const [design, setDesign] = useState(() => randomEarringDesign(DEFAULT_EARRING_SETTINGS));
  const [pastDesigns, setPastDesigns] = useState<EarringDesign[]>([]);
  const [futureDesigns, setFutureDesigns] = useState<EarringDesign[]>([]);
  const [earringColor, setEarringColor] = useState(DEFAULT_EARRING_COLOR);
  const [tracedSymbolPaths, setTracedSymbolPaths] = useState<TracedSymbolPaths>({});
  const shapePath = useMemo(() => buildEarringPath(design, tracedSymbolPaths), [design, tracedSymbolPaths]);
  const holePaths = useMemo(() => design.holes.map((hole) => buildHolePath(hole, tracedSymbolPaths)), [design.holes, tracedSymbolPaths]);
  const missingTraceIds = useMemo(() => {
    const symbolIds = [
      design.shapeFamily !== "geometriques" ? design.shapeSymbol : null,
      ...design.holes.map((hole) => hole.shape),
    ].filter((symbolId): symbolId is string => Boolean(symbolId));

    return Array.from(new Set(symbolIds.filter((symbolId) => {
      const definition = getSymbolDefinition(symbolId);
      return Boolean(definition.source) && !tracedSymbolPaths[symbolId];
    })));
  }, [design.holes, design.shapeFamily, design.shapeSymbol, tracedSymbolPaths]);
  const holeRadius = 1;
  const holeDiameter = holeRadius * 2;
  const thickness = 2;
  const {
    bodyHoleY,
    hookOuterRadius,
    hookTransitionPath,
    hookX,
    hookY,
  } = getHookLayout(design);
  const holeSummary = design.holes.length === 0
    ? "aucun"
    : Array.from(new Set(design.holes.map((hole) => getHoleLabel(hole.shape)))).join(", ");
  const shapeFamilies = EARRING_SYMBOL_FAMILIES;
  const motifFamilies = EARRING_SYMBOL_FAMILIES;
  const canUseMotifs = settings.shapeFamily === "geometriques";
  const selectedShapeOptions = settings.shapeFamily === "geometriques"
    ? GEOMETRIC_BODY_SYMBOL_IDS.map((shape) => ({ id: shape, label: getShapeLabel(shape) }))
    : EARRING_SYMBOLS_BY_FAMILY[settings.shapeFamily];
  const selectedMotifOptions: Array<ChoiceSliderOption<EarringMotif>> = [
    { id: "aucun", label: "Aucun" },
    ...EARRING_SYMBOLS_BY_FAMILY[settings.motifFamily],
  ];
  const textures: EarringTexture[] = ["lisse", "facettes", "pixel", "courbes", "rainures"];

  useEffect(() => {
    if (missingTraceIds.length === 0) return;

    let cancelled = false;
    Promise.all(missingTraceIds.map(async (symbolId) => {
      const definition = getSymbolDefinition(symbolId);
      if (!definition.source) return null;
      const points = await traceSilhouetteSource(definition.source);
      return points.length > 0 ? [symbolId, points] as const : null;
    })).then((entries) => {
      if (cancelled) return;
      setTracedSymbolPaths((current) => {
        const next = { ...current };
        entries.forEach((entry) => {
          if (entry) next[entry[0]] = entry[1];
        });
        return next;
      });
    }).catch(() => {
      // The procedural symbol remains available if a reference image cannot be traced.
    });

    return () => {
      cancelled = true;
    };
  }, [missingTraceIds]);

  const pushDesign = (nextDesign: EarringDesign) => {
    setPastDesigns((past) => [...past, design]);
    setFutureDesigns([]);
    setDesign(nextDesign);
  };

  const updateStructuralSettings = (nextSettings: EarringSettings) => {
    const normalizedSettings = normalizeMotifAvailability(nextSettings);
    setSettings(normalizedSettings);
    pushDesign(randomEarringDesign(normalizedSettings));
  };

  const updateDetailSettings = (nextSettings: EarringSettings) => {
    const normalizedSettings = normalizeMotifAvailability(nextSettings);
    setSettings(normalizedSettings);
    pushDesign({
      ...design,
      holes: buildEarringHoles(design.width, design.height, design.shape, design.sides, design.rotation, normalizedSettings),
      texture: normalizedSettings.texture,
      exteriorHook: normalizedSettings.exteriorHook,
    });
  };

  const undoDesign = () => {
    setPastDesigns((past) => {
      const previous = past.at(-1);
      if (!previous) return past;
      setFutureDesigns((future) => [design, ...future]);
      setDesign(previous);
      return past.slice(0, -1);
    });
  };

  const redoDesign = () => {
    setFutureDesigns((future) => {
      const next = future[0];
      if (!next) return future;
      setPastDesigns((past) => [...past, design]);
      setDesign(next);
      return future.slice(1);
    });
  };

  const exportEarringSTL = () => {
    toast("Export STL Boucle bientot disponible");
  };

  return (
    <div className="earring-app">
      <header className="app-header earring-topbar">
        <button className="btn-small" type="button" onClick={onBack}>
          Ateliers
        </button>
        <h1>Boucle</h1>
        <span className="version">Web Edition v{__APP_VERSION__}</span>
      </header>

      <div className="earring-body">
        <aside className="earring-panel" aria-label="Parametres de la boucle">
          <label className="earring-check">
            <input type="checkbox" checked={settings.randomMode} onChange={(event) => updateStructuralSettings({ ...settings, randomMode: event.target.checked })} />
            <span>Aleatoire</span>
          </label>

          <label className="earring-check">
            <input type="checkbox" checked={settings.exteriorHook} onChange={(event) => updateDetailSettings({ ...settings, exteriorHook: event.target.checked })} />
            <span>Trous exterieur</span>
          </label>

          <div className="earring-color-control">
            <label htmlFor="earring-color">Couleur</label>
            <input id="earring-color" type="color" value={earringColor} onChange={(event) => setEarringColor(event.target.value)} />
          </div>

          <ChoiceSlider
              id="earring-shape-family"
            label="Famille forme"
            options={shapeFamilies}
              value={settings.shapeFamily}
              disabled={settings.randomMode}
            onChange={(shapeFamily) => {
                const shapeSymbol = shapeFamily === "geometriques" ? "rond" : getDefaultSymbolForFamily(shapeFamily);
                updateStructuralSettings({
                  ...settings,
                  shapeFamily,
                  shapeSymbol,
                  shape: isBaseShapeSymbol(shapeSymbol) ? shapeSymbol : "rond",
                });
              }}
          />

          <ChoiceSlider
              id="earring-shape"
            label="Forme"
            options={selectedShapeOptions}
              value={settings.shapeSymbol}
              disabled={settings.randomMode}
            onChange={(shapeSymbol) => {
                updateStructuralSettings({
                  ...settings,
                  shapeSymbol,
                  shape: isBaseShapeSymbol(shapeSymbol) ? shapeSymbol : "rond",
                });
              }}
          />

          <ChoiceSlider
              id="earring-motif-family"
            label="Famille motif"
            options={motifFamilies}
              value={settings.motifFamily}
            disabled={settings.randomMode || !canUseMotifs}
            onChange={(motifFamily) => {
                updateDetailSettings({
                  ...settings,
                  motifFamily,
                  motif: getDefaultSymbolForFamily(motifFamily),
                  motifCount: Math.max(1, settings.motifCount),
                });
              }}
          />

          <ChoiceSlider
              id="earring-motif"
            label="Motif"
            options={selectedMotifOptions}
              value={settings.motif}
            disabled={settings.randomMode || !canUseMotifs}
            onChange={(motif) => {
                updateDetailSettings({ ...settings, motif, motifCount: motif === "aucun" ? 0 : Math.max(1, settings.motifCount) });
              }}
          />

          <div className="earring-slider-control">
            <div className="earring-slider-header">
              <label htmlFor="earring-count">Nombre</label>
              <strong>{settings.motif === "aucun" ? 0 : settings.motifCount}</strong>
            </div>
            <input
              id="earring-count"
              type="range"
              min="0"
              max={MAX_MOTIF_COUNT}
              step="1"
              value={settings.motif === "aucun" ? 0 : settings.motifCount}
              disabled={settings.randomMode || !canUseMotifs || settings.motif === "aucun"}
              onChange={(event) => updateDetailSettings({ ...settings, motifCount: Number(event.target.value) })}
            />
          </div>

          <div className="earring-slider-control">
            <div className="earring-slider-header">
              <label htmlFor="earring-size">Taille</label>
              <strong>{settings.motif === "aucun" ? "0%" : `${settings.motifScale}%`}</strong>
            </div>
            <input
              id="earring-size"
              type="range"
              min="25"
              max="100"
              step="5"
              value={settings.motif === "aucun" ? 25 : settings.motifScale}
              disabled={settings.randomMode || !canUseMotifs || settings.motif === "aucun"}
              onChange={(event) => updateDetailSettings({ ...settings, motifScale: Number(event.target.value) })}
            />
          </div>

          <div className="earring-control">
            <label htmlFor="earring-texture">Texture</label>
            <select id="earring-texture" value={settings.texture} disabled={settings.randomMode} onChange={(event) => updateDetailSettings({ ...settings, texture: event.target.value as EarringTexture })}>
              {textures.map((texture) => <option key={texture} value={texture}>{getTextureLabel(texture)}</option>)}
            </select>
          </div>

          <div className="earring-param"><span>Largeur</span><strong>{design.width} mm</strong></div>
          <div className="earring-param"><span>Hauteur</span><strong>{design.height} mm</strong></div>
          <div className="earring-param"><span>Trou haut</span><strong>{holeDiameter} mm</strong></div>
          <div className="earring-param"><span>Epaisseur</span><strong>{thickness} mm</strong></div>
          <div className="earring-param"><span>Perforations</span><strong>{design.holes.length}</strong></div>
          <div className="earring-param"><span>Texture</span><strong>{getTextureLabel(design.texture)}</strong></div>
          <div className="earring-param earring-param-wide"><span>Motifs</span><strong>{holeSummary}</strong></div>
        </aside>

        <main className="earring-main-content">
          <section className="earring-preview" aria-label="Apercu de la boucle d'oreille">
            <EarringViewer3D
              color={earringColor}
              design={design}
              shapePath={shapePath}
              holePaths={holePaths}
              bodyHoleY={bodyHoleY}
              hookTransitionPath={hookTransitionPath}
              hookX={hookX}
              hookY={hookY}
              hookOuterRadius={hookOuterRadius}
              thickness={thickness}
            />
          </section>

          <div className="earring-toolbar">
            <div className="toolbar-group">
              <button className="btn btn-icon" type="button" onClick={undoDesign} disabled={pastDesigns.length === 0} title="Arriere">&#x21A9;</button>
              <button className="btn btn-icon" type="button" onClick={redoDesign} disabled={futureDesigns.length === 0} title="Avant">&#x21AA;</button>
            </div>
            <div className="toolbar-group">
              <button className="btn btn-primary" type="button" onClick={() => pushDesign(randomEarringDesign(settings))}>Aleatoire</button>
              <button className="btn btn-secondary" type="button" onClick={exportEarringSTL}>Exporter STL</button>
            </div>
          </div>
        </main>

        <aside className="earring-right-panel" aria-label="Vues schematiques de la boucle">
          <EarringSilhouetteView
            bodyHoleY={bodyHoleY}
            design={design}
            holePaths={holePaths}
            hookOuterRadius={hookOuterRadius}
            hookTransitionPath={hookTransitionPath}
            hookX={hookX}
            hookY={hookY}
            shapePath={shapePath}
          />
          <EarringTopView design={design} thickness={thickness} />
        </aside>
      </div>
    </div>
  );
}
