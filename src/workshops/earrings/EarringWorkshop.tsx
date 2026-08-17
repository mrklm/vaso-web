import { useMemo, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import toast from "react-hot-toast";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

type EarringBaseShape = "carre" | "triangle" | "rond" | "hexagone" | "polygone" | "arcade" | "sylvain";
type EarringHoleShape = "rond" | "carre" | "triangle" | "coeur" | "etoile" | "sourire" | "goutte" | "chien";
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
  motif: EarringHoleShape;
  motifCount: number;
  motifSize: "petit" | "moyen" | "grand" | "maxi";
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
  motifSize: "maxi",
  texture: "lisse",
  randomMode: true,
  exteriorHook: true,
};

const DEFAULT_EARRING_COLOR = "#f6f6f2";

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomEarringDesign(settings: EarringSettings): EarringDesign {
  const randomShapes: EarringBaseShape[] = ["carre", "triangle", "rond", "hexagone", "polygone", "arcade", "sylvain"];
  const randomMotifs: EarringHoleShape[] = ["rond", "carre", "triangle", "coeur", "etoile", "sourire", "goutte", "chien"];
  const randomTextures: EarringTexture[] = ["lisse", "facettes", "pixel", "courbes", "rainures"];
  const generatedSettings = settings.randomMode
    ? {
        ...settings,
        shape: randomShapes[randomBetween(0, randomShapes.length - 1)],
        motif: randomMotifs[randomBetween(0, randomMotifs.length - 1)],
        motifCount: 1,
        motifSize: "maxi" as const,
        texture: randomTextures[randomBetween(0, randomTextures.length - 1)],
      }
    : settings;
  const shape = generatedSettings.shape;
  const sides = shape === "hexagone" ? 6 : randomBetween(5, 9);
  const width = shape === "sylvain" ? randomBetween(30, 40) : randomBetween(26, 46);
  const height = shape === "arcade" || shape === "sylvain" ? randomBetween(42, 58) : randomBetween(32, 56);

  return {
    shape,
    width,
    height,
    sides,
    rotation: randomBetween(-12, 12),
    holes: buildEarringHoles(width, height, shape, generatedSettings),
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
    arcade: "Arcade",
    sylvain: "Sylvain",
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
    chien: "chiens",
  }[shape];
}

function getMotifLabel(shape: EarringHoleShape): string {
  return {
    rond: "Rond",
    carre: "Carre",
    triangle: "Triangle",
    coeur: "Coeur",
    etoile: "Etoile",
    sourire: "Sourire",
    goutte: "Goutte",
    chien: "Chien",
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

function getMotifSizeLabel(size: EarringSettings["motifSize"]): string {
  return {
    petit: "Petit",
    moyen: "Moyen",
    grand: "Grand",
    maxi: "Maxi",
  }[size];
}

function getMotifSizeRange(size: EarringSettings["motifSize"], width: number, height: number): [number, number] {
  const max = Math.min(width, height) * 0.34;
  if (size === "petit") return [2, 3.4];
  if (size === "moyen") return [3.5, 5.8];
  if (size === "grand") return [6, Math.min(9, max)];
  return [Math.min(10, max), max];
}

function getSafeCenteredMotif(width: number, height: number, shape: EarringBaseShape) {
  const baseSize = Math.min(width, height) * 0.34;
  const shapeScale: Record<EarringBaseShape, number> = {
    carre: 1,
    triangle: 0.68,
    rond: 1,
    hexagone: 0.92,
    polygone: 0.9,
    arcade: 0.72,
    sylvain: 0.64,
  };
  return { x: 35, y: 43, size: Number((baseSize * shapeScale[shape]).toFixed(2)) };
}

function buildEarringHoles(width: number, height: number, shape: EarringBaseShape, settings: EarringSettings): EarringHole[] {
  const count = settings.motifCount;
  const [minSize, maxSize] = getMotifSizeRange(settings.motifSize, width, height);

  if (count === 1) {
    const centeredMotif = getSafeCenteredMotif(width, height, shape);
    return [{
      shape: settings.motif,
      x: centeredMotif.x,
      y: centeredMotif.y,
      size: settings.motifSize === "maxi" ? centeredMotif.size : Number(maxSize.toFixed(2)),
      rotation: settings.motif === "carre" ? 45 : 0,
    }];
  }

  const holes: EarringHole[] = [];
  const minX = 35 - width * 0.22;
  const maxX = 35 + width * 0.22;
  const minY = 42 - height * 0.06;
  const maxY = 42 + height * 0.24;

  for (let attempt = 0; holes.length < count && attempt < 80; attempt += 1) {
    const candidate: EarringHole = {
      shape: settings.motif,
      x: Number(randomFloat(minX, maxX).toFixed(2)),
      y: Number(randomFloat(minY, maxY).toFixed(2)),
      size: Number(randomFloat(minSize, maxSize).toFixed(2)),
      rotation: randomBetween(-35, 35),
    };
    const hasEnoughSpacing = holes.every((hole) => Math.hypot(candidate.x - hole.x, candidate.y - hole.y) > candidate.size + hole.size + 1.4);
    const keepsTopClear = Math.hypot(candidate.x - 35, candidate.y - (42 - height / 2 + 5)) > 7;
    if (hasEnoughSpacing && keepsTopClear) holes.push(candidate);
  }

  return holes;
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
  if (design.shape === "arcade") return [`M ${cx - halfWidth * 0.82} ${bottom}`, `L ${cx - halfWidth} ${bottom - halfHeight * 0.34}`, `L ${cx - halfWidth * 0.78} ${cy - halfHeight * 0.08}`, `L ${cx - halfWidth * 0.62} ${top + halfHeight * 0.36}`, `L ${cx - halfWidth * 0.38} ${top + halfHeight * 0.14}`, `L ${cx - halfWidth * 0.12} ${top}`, `L ${cx + halfWidth * 0.12} ${top}`, `L ${cx + halfWidth * 0.38} ${top + halfHeight * 0.14}`, `L ${cx + halfWidth * 0.62} ${top + halfHeight * 0.36}`, `L ${cx + halfWidth * 0.78} ${cy - halfHeight * 0.08}`, `L ${cx + halfWidth} ${bottom - halfHeight * 0.34}`, `L ${cx + halfWidth * 0.82} ${bottom}`, `L ${cx + halfWidth * 0.18} ${bottom}`, `L ${cx + halfWidth * 0.08} ${bottom - halfHeight * 0.16}`, `L ${cx - halfWidth * 0.08} ${bottom - halfHeight * 0.16}`, `L ${cx - halfWidth * 0.18} ${bottom}`, "Z"].join(" ");
  if (design.shape === "sylvain") return [`M ${cx} ${top}`, `C ${right} ${top}, ${right + 4} ${cy - 8}, ${cx + halfWidth * 0.54} ${cy + 2}`, `C ${right} ${cy + halfHeight * 0.22}, ${cx + halfWidth * 0.28} ${bottom}, ${cx + 3} ${bottom}`, `C ${cx + 2} ${bottom - 8}, ${cx - 2} ${bottom - 8}, ${cx - 3} ${bottom}`, `C ${cx - halfWidth * 0.28} ${bottom}, ${left} ${cy + halfHeight * 0.22}, ${cx - halfWidth * 0.54} ${cy + 2}`, `C ${left - 4} ${cy - 8}, ${left} ${top}, ${cx} ${top}`, "Z"].join(" ");
  return buildPolygonPath(design.width, design.height, design.sides, -90 + design.rotation);
}

function getBodyHalfWidthAtOffset(design: EarringDesign, offsetFromTop: number): number {
  const halfWidth = design.width / 2;
  const halfHeight = design.height / 2;
  const progress = Math.max(0, Math.min(1, offsetFromTop / Math.max(1, design.height)));
  if (design.shape === "triangle") return Math.max(1.8, halfWidth * progress);
  if (design.shape === "hexagone" || design.shape === "polygone") return Math.max(2.2, halfWidth * Math.min(1, progress * 2.6));
  if (design.shape === "arcade") return Math.max(2.6, halfWidth * Math.min(1, progress * 2.1));
  if (design.shape === "sylvain" || design.shape === "rond") {
    const normalized = Math.max(0, Math.min(1, offsetFromTop / halfHeight));
    return Math.max(2.8, halfWidth * Math.sin((normalized * Math.PI) / 2) * 0.72);
  }
  return Math.max(3, halfWidth * 0.42);
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

function buildDogPath(cx: number, cy: number, size: number): string {
  const s = size / 10;
  return [`M ${cx - s * 4.8} ${cy - s * 0.8}`, `C ${cx - s * 4.8} ${cy - s * 4.2}, ${cx - s * 2.2} ${cy - s * 5}, ${cx} ${cy - s * 4.2}`, `C ${cx + s * 2.2} ${cy - s * 5}, ${cx + s * 4.8} ${cy - s * 4.2}, ${cx + s * 4.8} ${cy - s * 0.8}`, `L ${cx + s * 3.1} ${cy + s * 4.2}`, `L ${cx + s * 1.2} ${cy + s * 2.8}`, `L ${cx} ${cy + s * 4.8}`, `L ${cx - s * 1.2} ${cy + s * 2.8}`, `L ${cx - s * 3.1} ${cy + s * 4.2}`, "Z"].join(" ");
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
  if (hole.shape === "chien") return buildDogPath(hole.x, hole.y, hole.size);
  return buildDropPath(hole.x, hole.y, hole.size);
}

function parseSvgShapes(path: string): THREE.Shape[] {
  const loader = new SVGLoader();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}" /></svg>`;
  return loader.parse(svg).paths.flatMap((svgPath) => SVGLoader.createShapes(svgPath));
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
      transition: design.exteriorHook ? createExtrudedGeometry(hookTransitionPath, [], thickness) : null,
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
      rotation={[0, mirror ? -0.08 : 0.08, mirror ? -0.05 : 0.05]}
    >
      <mesh geometry={geometries.body} material={material} castShadow receiveShadow />
      <lineSegments geometry={new THREE.EdgesGeometry(geometries.body, 28)} material={edgeMaterial} />
      {geometries.transition && <mesh geometry={geometries.transition} material={material} castShadow receiveShadow />}
      {geometries.transition && <lineSegments geometry={new THREE.EdgesGeometry(geometries.transition, 28)} material={edgeMaterial} />}
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
  const bodyHoleY = 42 - design.height / 2 + 5;
  const topY = 42 - design.height / 2;
  const hookX = 35;
  const hookY = design.exteriorHook ? topY - 3 : bodyHoleY;
  const hookOuterRadius = design.exteriorHook ? 3 : 1;
  const hookNeckTop = hookY + hookOuterRadius * 0.42;
  const hookShoulderY = topY + Math.min(9, Math.max(5.6, design.height * 0.16));
  const hookShoulderHalfWidth = Math.max(3.2, getBodyHalfWidthAtOffset(design, hookShoulderY - topY));
  const hookNeckHalfWidth = 2.15;
  const hookTransitionPath = [`M ${hookX - hookNeckHalfWidth} ${hookNeckTop}`, `C ${hookX - hookNeckHalfWidth} ${topY - 0.8}, ${hookX - hookShoulderHalfWidth * 0.52} ${topY + 2.2}, ${hookX - hookShoulderHalfWidth} ${hookShoulderY}`, `L ${hookX + hookShoulderHalfWidth} ${hookShoulderY}`, `C ${hookX + hookShoulderHalfWidth * 0.52} ${topY + 2.2}, ${hookX + hookNeckHalfWidth} ${topY - 0.8}, ${hookX + hookNeckHalfWidth} ${hookNeckTop}`, `Q ${hookX} ${hookNeckTop + 1.25} ${hookX - hookNeckHalfWidth} ${hookNeckTop}`, "Z"].join(" ");
  const holeSummary = Array.from(new Set(design.holes.map((hole) => getHoleLabel(hole.shape)))).join(", ");
  const baseShapes: EarringBaseShape[] = ["rond", "carre", "triangle", "hexagone", "polygone", "arcade", "sylvain"];
  const motifShapes: EarringHoleShape[] = ["rond", "carre", "triangle", "coeur", "etoile", "sourire", "goutte", "chien"];
  const motifSizes: EarringSettings["motifSize"][] = ["petit", "moyen", "grand", "maxi"];
  const motifCounts = [1, 2, 3, 4, 5, 6, 8, 10];
  const textures: EarringTexture[] = ["lisse", "facettes", "pixel", "courbes", "rainures"];

  const pushDesign = (nextDesign: EarringDesign) => {
    setPastDesigns((past) => [...past, design]);
    setFutureDesigns([]);
    setDesign(nextDesign);
  };

  const updateSettings = (nextSettings: EarringSettings) => {
    setSettings(nextSettings);
    pushDesign(randomEarringDesign(nextSettings));
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
      <header className="earring-topbar">
        <button className="btn-small" type="button" onClick={onBack}>
          Ateliers
        </button>
        <h1>Boucle</h1>
      </header>

      <main className="earring-body">
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

        <aside className="earring-panel" aria-label="Parametres de la boucle">
          <label className="earring-check">
            <input type="checkbox" checked={settings.randomMode} onChange={(event) => updateSettings({ ...settings, randomMode: event.target.checked })} />
            <span>Aleatoire</span>
          </label>

          <label className="earring-check">
            <input type="checkbox" checked={settings.exteriorHook} onChange={(event) => updateSettings({ ...settings, exteriorHook: event.target.checked })} />
            <span>Trous exterieur</span>
          </label>

          <div className="earring-color-control">
            <label htmlFor="earring-color">Couleur</label>
            <input id="earring-color" type="color" value={earringColor} onChange={(event) => setEarringColor(event.target.value)} />
          </div>

          <div className="earring-control">
            <label htmlFor="earring-shape">Forme</label>
            <select id="earring-shape" value={settings.shape} disabled={settings.randomMode} onChange={(event) => updateSettings({ ...settings, shape: event.target.value as EarringBaseShape })}>
              {baseShapes.map((shape) => <option key={shape} value={shape}>{getShapeLabel(shape)}</option>)}
            </select>
          </div>

          <div className="earring-control">
            <label htmlFor="earring-motif">Motif</label>
            <select id="earring-motif" value={settings.motif} disabled={settings.randomMode} onChange={(event) => updateSettings({ ...settings, motif: event.target.value as EarringHoleShape })}>
              {motifShapes.map((motif) => <option key={motif} value={motif}>{getMotifLabel(motif)}</option>)}
            </select>
          </div>

          <div className="earring-control">
            <label htmlFor="earring-count">Nombre</label>
            <select id="earring-count" value={settings.motifCount} disabled={settings.randomMode} onChange={(event) => updateSettings({ ...settings, motifCount: Number(event.target.value) })}>
              {motifCounts.map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </div>

          <div className="earring-control">
            <label htmlFor="earring-size">Taille</label>
            <select id="earring-size" value={settings.motifSize} disabled={settings.randomMode} onChange={(event) => updateSettings({ ...settings, motifSize: event.target.value as EarringSettings["motifSize"] })}>
              {motifSizes.map((size) => <option key={size} value={size}>{getMotifSizeLabel(size)}</option>)}
            </select>
          </div>

          <div className="earring-control">
            <label htmlFor="earring-texture">Texture</label>
            <select id="earring-texture" value={settings.texture} disabled={settings.randomMode} onChange={(event) => updateSettings({ ...settings, texture: event.target.value as EarringTexture })}>
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
      </main>

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
    </div>
  );
}
