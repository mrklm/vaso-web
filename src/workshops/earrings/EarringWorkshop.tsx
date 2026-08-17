import { useMemo, useState, type ReactNode } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import toast from "react-hot-toast";
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

type EarringBaseShape = "carre" | "triangle" | "rond" | "hexagone" | "polygone" | "coeur";
type EarringHoleShape = "rond" | "carre" | "triangle" | "coeur" | "etoile" | "sourire" | "goutte";
type EarringMotif = "aucun" | EarringHoleShape;
type EarringTexture = "lisse" | "facettes" | "pixel" | "courbes" | "rainures";

type EarringHole = {
  shape: EarringHoleShape;
  x: number;
  y: number;
  size: number;
  rotation: number;
};

type EarringSettings = {
  shape: EarringBaseShape;
  motif: EarringMotif;
  motifCount: number;
  motifScale: number;
  texture: EarringTexture;
  randomMode: boolean;
  exteriorHook: boolean;
};

type EarringDesign = {
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
  shape: "rond",
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

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function randomEarringDesign(settings: EarringSettings): EarringDesign {
  const randomShapes: EarringBaseShape[] = ["carre", "triangle", "rond", "hexagone", "polygone", "coeur"];
  const randomMotifs: EarringMotif[] = ["aucun", "rond", "carre", "triangle", "coeur", "etoile", "sourire", "goutte"];
  const randomTextures: EarringTexture[] = ["lisse", "facettes", "pixel", "courbes", "rainures"];
  const randomMotif = randomMotifs[randomBetween(0, randomMotifs.length - 1)];
  const generatedSettings = settings.randomMode
    ? {
        ...settings,
        shape: randomShapes[randomBetween(0, randomShapes.length - 1)],
        motif: randomMotif,
        motifCount: randomMotif === "aucun" ? 0 : 1,
        motifScale: randomBetween(72, 100),
        texture: randomTextures[randomBetween(0, randomTextures.length - 1)],
      }
    : settings;
  const shape = generatedSettings.shape;
  const sides = shape === "hexagone" ? 6 : randomBetween(5, 9);
  const width = shape === "coeur" ? randomBetween(38, 48) : randomBetween(26, 46);
  const height = shape === "coeur" ? randomBetween(34, 44) : randomBetween(32, 56);
  const rotation = randomBetween(-12, 12);

  return {
    shape,
    width,
    height,
    sides,
    rotation,
    holes: buildEarringHoles(width, height, shape, sides, rotation, generatedSettings),
    texture: generatedSettings.texture,
    exteriorHook: generatedSettings.exteriorHook,
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

function getHoleLabel(shape: EarringHoleShape): string {
  return {
    rond: "ronds",
    carre: "carres",
    triangle: "triangles",
    coeur: "coeurs",
    etoile: "etoiles",
    sourire: "sourires",
    goutte: "gouttes",
  }[shape];
}

function getMotifLabel(shape: EarringMotif): string {
  return {
    aucun: "Pas de motif",
    rond: "Rond",
    carre: "Carre",
    triangle: "Triangle",
    coeur: "Coeur",
    etoile: "Etoile",
    sourire: "Sourire",
    goutte: "Goutte",
  }[shape];
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
  motif: EarringHoleShape,
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
      rotation: motif === "carre" ? 45 : 0,
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
  motif: EarringHoleShape,
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
        rotation: motif === "carre" ? 45 : 0,
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
      rotation: motif === "carre" ? 45 : 0,
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
    rotation: motif === "carre" ? 45 : index % 2 === 0 ? 0 : 18,
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

function buildEarringPath(design: EarringDesign): string {
  const cx = 35;
  const cy = 42;
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

function buildStarPath(cx: number, cy: number, radius: number, rotation = -90): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const pointRadius = index % 2 === 0 ? radius : radius * 0.46;
    const angle = (rotation + index * 36) * (Math.PI / 180);
    return [cx + Math.cos(angle) * pointRadius, cy + Math.sin(angle) * pointRadius];
  });
  return `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
}

function buildHeartPath(cx: number, cy: number, size: number): string {
  const s = size / 4;
  return [`M ${cx} ${cy + s * 1.5}`, `C ${cx - s * 4} ${cy - s * 0.8}, ${cx - s * 2.4} ${cy - s * 4}, ${cx} ${cy - s * 1.8}`, `C ${cx + s * 2.4} ${cy - s * 4}, ${cx + s * 4} ${cy - s * 0.8}, ${cx} ${cy + s * 1.5}`, "Z"].join(" ");
}

function buildDropPath(cx: number, cy: number, size: number): string {
  const r = size / 2;
  return [`M ${cx} ${cy - r * 1.25}`, `C ${cx + r * 1.45} ${cy}, ${cx + r * 0.72} ${cy + r * 1.45}, ${cx} ${cy + r * 1.45}`, `C ${cx - r * 0.72} ${cy + r * 1.45}, ${cx - r * 1.45} ${cy}, ${cx} ${cy - r * 1.25}`, "Z"].join(" ");
}

function buildHolePath(hole: EarringHole): string {
  const half = hole.size / 2;
  if (hole.shape === "rond" || hole.shape === "sourire") return [`M ${hole.x} ${hole.y - half}`, `A ${half} ${half} 0 1 1 ${hole.x} ${hole.y + half}`, `A ${half} ${half} 0 1 1 ${hole.x} ${hole.y - half}`, "Z"].join(" ");
  if (hole.shape === "carre") return `M ${hole.x - half} ${hole.y - half} L ${hole.x + half} ${hole.y - half} L ${hole.x + half} ${hole.y + half} L ${hole.x - half} ${hole.y + half} Z`;
  if (hole.shape === "triangle") {
    const points = Array.from({ length: 3 }, (_, index) => {
      const angle = (-90 + hole.rotation + index * 120) * (Math.PI / 180);
      return [hole.x + Math.cos(angle) * half, hole.y + Math.sin(angle) * half];
    });
    return `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
  }
  if (hole.shape === "coeur") return buildHeartPath(hole.x, hole.y, hole.size);
  if (hole.shape === "etoile") return buildStarPath(hole.x, hole.y, half, -90 + hole.rotation);
  return buildDropPath(hole.x, hole.y, hole.size);
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
  const shapes = parseSvgShapes(path);
  const holes = holePaths.flatMap(parseSvgShapes);
  shapes.forEach((shape) => {
    holes.forEach((hole) => {
      shape.holes.push(hole);
    });
  });

  return prepareEarringGeometry(new THREE.ExtrudeGeometry(shapes, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.18,
    bevelThickness: 0.18,
    curveSegments: 28,
    steps: 1,
  }));
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
  hookOuterRadius,
  hookTransitionPath,
  hookX,
  hookY,
  shapePath,
}: {
  bodyHoleY: number;
  design: EarringDesign;
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
            {design.holes.map((hole, index) => <path key={index} d={buildHolePath(hole)} fill="#000000" />)}
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
        <text x="35" y="51" textAnchor="middle">{design.width} x {thickness} mm</text>
      </svg>
    </EarringSchematicView>
  );
}

type EarringWorkshopProps = {
  onBack: () => void;
};

export function EarringWorkshop({ onBack }: EarringWorkshopProps) {
  const [settings, setSettings] = useState<EarringSettings>(DEFAULT_EARRING_SETTINGS);
  const [design, setDesign] = useState(() => randomEarringDesign(DEFAULT_EARRING_SETTINGS));
  const [pastDesigns, setPastDesigns] = useState<EarringDesign[]>([]);
  const [futureDesigns, setFutureDesigns] = useState<EarringDesign[]>([]);
  const [earringColor, setEarringColor] = useState(DEFAULT_EARRING_COLOR);
  const shapePath = buildEarringPath(design);
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
  const baseShapes: EarringBaseShape[] = ["rond", "carre", "triangle", "hexagone", "polygone", "coeur"];
  const motifShapes: EarringMotif[] = ["aucun", "rond", "carre", "triangle", "coeur", "etoile", "sourire", "goutte"];
  const textures: EarringTexture[] = ["lisse", "facettes", "pixel", "courbes", "rainures"];

  const pushDesign = (nextDesign: EarringDesign) => {
    setPastDesigns((past) => [...past, design]);
    setFutureDesigns([]);
    setDesign(nextDesign);
  };

  const updateStructuralSettings = (nextSettings: EarringSettings) => {
    setSettings(nextSettings);
    pushDesign(randomEarringDesign(nextSettings));
  };

  const updateDetailSettings = (nextSettings: EarringSettings) => {
    setSettings(nextSettings);
    pushDesign({
      ...design,
      holes: buildEarringHoles(design.width, design.height, design.shape, design.sides, design.rotation, nextSettings),
      texture: nextSettings.texture,
      exteriorHook: nextSettings.exteriorHook,
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

          <div className="earring-control">
            <label htmlFor="earring-shape">Forme</label>
            <select id="earring-shape" value={settings.shape} disabled={settings.randomMode} onChange={(event) => updateStructuralSettings({ ...settings, shape: event.target.value as EarringBaseShape })}>
              {baseShapes.map((shape) => <option key={shape} value={shape}>{getShapeLabel(shape)}</option>)}
            </select>
          </div>

          <div className="earring-control">
            <label htmlFor="earring-motif">Motif</label>
            <select
              id="earring-motif"
              value={settings.motif}
              disabled={settings.randomMode}
              onChange={(event) => {
                const motif = event.target.value as EarringMotif;
                updateDetailSettings({ ...settings, motif, motifCount: motif === "aucun" ? 0 : Math.max(1, settings.motifCount) });
              }}
            >
              {motifShapes.map((motif) => <option key={motif} value={motif}>{getMotifLabel(motif)}</option>)}
            </select>
          </div>

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
              disabled={settings.randomMode || settings.motif === "aucun"}
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
              disabled={settings.randomMode || settings.motif === "aucun"}
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
              holePaths={design.holes.map(buildHolePath)}
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
