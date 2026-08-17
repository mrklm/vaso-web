export type EarringSymbolFamilyId =
  | "geometriques"
  | "oiseaux"
  | "arbres"
  | "animaux"
  | "fleurs"
  | "maisons"
  | "pylonnes"
  | "insectes";

export type EarringSymbolDefinition = {
  id: string;
  label: string;
  pluralLabel: string;
  familyId: EarringSymbolFamilyId;
  source?: string;
};

export const GEOMETRIC_BODY_SYMBOL_IDS = ["rond", "carre", "triangle", "hexagone", "polygone", "coeur"] as const;

export const EARRING_SYMBOL_FAMILIES: Array<{ id: EarringSymbolFamilyId; label: string }> = [
  { id: "geometriques", label: "Formes geometriques" },
  { id: "oiseaux", label: "Oiseaux" },
  { id: "arbres", label: "Arbres" },
  { id: "animaux", label: "Animaux" },
  { id: "fleurs", label: "Fleurs" },
  { id: "maisons", label: "Maisons" },
  { id: "pylonnes", label: "Pylonnes" },
  { id: "insectes", label: "Insectes" },
];

const geometricSymbols: EarringSymbolDefinition[] = [
  { id: "rond", label: "Rond", pluralLabel: "ronds", familyId: "geometriques" },
  { id: "carre", label: "Carre", pluralLabel: "carres", familyId: "geometriques" },
  { id: "triangle", label: "Triangle", pluralLabel: "triangles", familyId: "geometriques" },
  { id: "hexagone", label: "Hexagone", pluralLabel: "hexagones", familyId: "geometriques" },
  { id: "polygone", label: "Polygone", pluralLabel: "polygones", familyId: "geometriques" },
  { id: "coeur", label: "Coeur", pluralLabel: "coeurs", familyId: "geometriques" },
  { id: "etoile", label: "Etoile", pluralLabel: "etoiles", familyId: "geometriques" },
  { id: "sourire", label: "Sourire", pluralLabel: "sourires", familyId: "geometriques" },
  { id: "goutte", label: "Goutte", pluralLabel: "gouttes", familyId: "geometriques" },
];

const familySources: Record<Exclude<EarringSymbolFamilyId, "geometriques">, Array<{ file: string; label: string }>> = {
  oiseaux: [
    { file: "Hirondelle.jpg", label: "Hirondelle" },
    { file: "heron.jpeg", label: "Heron" },
    { file: "martin pecheur.jpg", label: "Martin pecheur" },
    { file: "mesange.webp", label: "Mesange" },
    { file: "pic vert.png", label: "Pic vert" },
  ],
  arbres: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "7.jpg", "8.jpg", "9.jpg", "10.jpg", "11.png"].map((file) => ({ file, label: `Arbre ${file.split(".")[0]}` })),
  animaux: ["1.jpg", "2.png", "3.png", "4.png", "5.png", "6.jpg", "7.png", "8.png", "9.png", "10.png", "11.png", "12.png", "13.png", "14.png", "15.png", "16.png"].map((file) => ({ file, label: `Animal ${file.split(".")[0]}` })),
  fleurs: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png", "9.png", "10.png", "11.png", "12.png", "13.png", "14.png", "15.png", "16.png", "17.png", "18.png", "19.png"].map((file) => ({ file, label: `Fleur ${file.split(".")[0]}` })),
  maisons: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png", "9.png", "10.png", "11.png", "12.png"].map((file) => ({ file, label: `Maison ${file.split(".")[0]}` })),
  pylonnes: ["1.png", "2.png", "3.png", "4.png", "5.png"].map((file) => ({ file, label: `Pylonne ${file.split(".")[0]}` })),
  insectes: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.jpg"].map((file) => ({ file, label: `Insecte ${file.split(".")[0]}` })),
};

const sourceSymbols = Object.entries(familySources).flatMap(([familyId, files]) =>
  files.map(({ file, label }) => ({
    id: `${familyId}-${file.replace(/\.[^.]+$/, "").replace(/\s+/g, "-").toLowerCase()}`,
    label,
    pluralLabel: label.toLowerCase(),
    familyId: familyId as EarringSymbolFamilyId,
    source: `silhouettes/${capitalizePathSegment(familyId)}/${file}`,
  })),
);

export const EARRING_SYMBOLS: EarringSymbolDefinition[] = [
  ...geometricSymbols,
  ...sourceSymbols,
];

export const EARRING_SYMBOLS_BY_FAMILY = EARRING_SYMBOL_FAMILIES.reduce((groups, family) => {
  groups[family.id] = EARRING_SYMBOLS.filter((symbol) => symbol.familyId === family.id);
  return groups;
}, {} as Record<EarringSymbolFamilyId, EarringSymbolDefinition[]>);

export function getDefaultSymbolForFamily(familyId: EarringSymbolFamilyId): string {
  return EARRING_SYMBOLS_BY_FAMILY[familyId][0]?.id ?? "rond";
}

export function getSymbolDefinition(symbolId: string): EarringSymbolDefinition {
  return EARRING_SYMBOLS.find((symbol) => symbol.id === symbolId) ?? geometricSymbols[0];
}

export function isSquareSymbol(symbolId: string): boolean {
  return symbolId === "carre";
}

export function buildSymbolPath(symbolId: string, cx: number, cy: number, size: number, rotation = 0): string {
  const definition = getSymbolDefinition(symbolId);
  if (definition.familyId === "geometriques") return buildGeometricPath(definition.id, cx, cy, size, rotation);
  if (definition.familyId === "oiseaux") return buildBirdPath(cx, cy, size, symbolIndex(symbolId));
  if (definition.familyId === "arbres") return buildTreePath(cx, cy, size, symbolIndex(symbolId));
  if (definition.familyId === "animaux") return buildAnimalPath(cx, cy, size, symbolIndex(symbolId));
  if (definition.familyId === "fleurs") return buildFlowerPath(cx, cy, size, symbolIndex(symbolId));
  if (definition.familyId === "maisons") return buildHousePath(cx, cy, size, symbolIndex(symbolId));
  if (definition.familyId === "pylonnes") return buildPylonPath(cx, cy, size, symbolIndex(symbolId));
  return buildInsectPath(cx, cy, size, symbolIndex(symbolId));
}

function capitalizePathSegment(value: string): string {
  return {
    animaux: "Animaux",
    arbres: "Arbres",
    fleurs: "Fleurs",
    insectes: "Insectes",
    maisons: "Maisons",
    oiseaux: "Oiseaux",
    pylonnes: "Pylonnes",
  }[value] ?? value;
}

function symbolIndex(symbolId: string): number {
  return [...symbolId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function p(cx: number, cy: number, size: number, x: number, y: number): string {
  return `${(cx + x * size).toFixed(2)} ${(cy + y * size).toFixed(2)}`;
}

function buildGeometricPath(symbolId: string, cx: number, cy: number, size: number, rotation: number): string {
  const half = size / 2;
  if (symbolId === "rond" || symbolId === "sourire") return [`M ${cx} ${cy - half}`, `A ${half} ${half} 0 1 1 ${cx} ${cy + half}`, `A ${half} ${half} 0 1 1 ${cx} ${cy - half}`, "Z"].join(" ");
  if (symbolId === "carre") return `M ${cx - half} ${cy - half} L ${cx + half} ${cy - half} L ${cx + half} ${cy + half} L ${cx - half} ${cy + half} Z`;
  if (symbolId === "triangle") return buildRegularPolygon(cx, cy, half, 3, -90 + rotation);
  if (symbolId === "hexagone") return buildRegularPolygon(cx, cy, half, 6, -90 + rotation);
  if (symbolId === "polygone") return buildRegularPolygon(cx, cy, half, 8, -90 + rotation);
  if (symbolId === "coeur") return buildHeart(cx, cy, size);
  if (symbolId === "etoile") return buildStar(cx, cy, half, -90 + rotation);
  return buildDrop(cx, cy, size);
}

function buildRegularPolygon(cx: number, cy: number, radius: number, sides: number, rotation = -90): string {
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = (rotation + index * (360 / sides)) * (Math.PI / 180);
    return `${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  });
  return `M ${points.join(" L ")} Z`;
}

function buildStar(cx: number, cy: number, radius: number, rotation = -90): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const pointRadius = index % 2 === 0 ? radius : radius * 0.46;
    const angle = (rotation + index * 36) * (Math.PI / 180);
    return `${(cx + Math.cos(angle) * pointRadius).toFixed(2)} ${(cy + Math.sin(angle) * pointRadius).toFixed(2)}`;
  });
  return `M ${points.join(" L ")} Z`;
}

function buildHeart(cx: number, cy: number, size: number): string {
  const s = size / 4;
  return [`M ${cx} ${cy + s * 1.5}`, `C ${cx - s * 4} ${cy - s * 0.8}, ${cx - s * 2.4} ${cy - s * 4}, ${cx} ${cy - s * 1.8}`, `C ${cx + s * 2.4} ${cy - s * 4}, ${cx + s * 4} ${cy - s * 0.8}, ${cx} ${cy + s * 1.5}`, "Z"].join(" ");
}

function buildDrop(cx: number, cy: number, size: number): string {
  const r = size / 2;
  return [`M ${cx} ${cy - r * 1.25}`, `C ${cx + r * 1.45} ${cy}, ${cx + r * 0.72} ${cy + r * 1.45}, ${cx} ${cy + r * 1.45}`, `C ${cx - r * 0.72} ${cy + r * 1.45}, ${cx - r * 1.45} ${cy}, ${cx} ${cy - r * 1.25}`, "Z"].join(" ");
}

function buildBirdPath(cx: number, cy: number, size: number, variant: number): string {
  const tail = variant % 2 === 0 ? -0.5 : -0.42;
  const beak = variant % 3 === 0 ? 0.55 : 0.48;
  return [
    `M ${p(cx, cy, size, tail, 0.08)}`,
    `C ${p(cx, cy, size, -0.22, -0.42)}, ${p(cx, cy, size, 0.18, -0.42)}, ${p(cx, cy, size, 0.34, -0.12)}`,
    `L ${p(cx, cy, size, beak, -0.06)}`,
    `L ${p(cx, cy, size, 0.36, 0.04)}`,
    `C ${p(cx, cy, size, 0.12, 0.38)}, ${p(cx, cy, size, -0.22, 0.38)}, ${p(cx, cy, size, tail, 0.08)}`,
    "Z",
  ].join(" ");
}

function buildTreePath(cx: number, cy: number, size: number, variant: number): string {
  const crown = variant % 2 === 0 ? 0.54 : 0.48;
  return [
    `M ${p(cx, cy, size, -0.14, 0.5)} L ${p(cx, cy, size, 0.14, 0.5)} L ${p(cx, cy, size, 0.1, 0.15)} L ${p(cx, cy, size, 0.42, 0.12)}`,
    `C ${p(cx, cy, size, crown, -0.18)}, ${p(cx, cy, size, 0.22, -0.48)}, ${p(cx, cy, size, 0, -0.52)}`,
    `C ${p(cx, cy, size, -0.28, -0.5)}, ${p(cx, cy, size, -0.54, -0.18)}, ${p(cx, cy, size, -0.42, 0.12)}`,
    `L ${p(cx, cy, size, -0.1, 0.15)} Z`,
  ].join(" ");
}

function buildAnimalPath(cx: number, cy: number, size: number, variant: number): string {
  const ear = variant % 2 === 0 ? -0.42 : -0.35;
  return [
    `M ${p(cx, cy, size, -0.48, 0.2)} C ${p(cx, cy, size, -0.5, -0.14)}, ${p(cx, cy, size, -0.18, -0.34)}, ${p(cx, cy, size, 0.08, -0.28)}`,
    `L ${p(cx, cy, size, 0.2, ear)} L ${p(cx, cy, size, 0.3, -0.22)}`,
    `C ${p(cx, cy, size, 0.5, -0.08)}, ${p(cx, cy, size, 0.48, 0.24)}, ${p(cx, cy, size, 0.24, 0.34)}`,
    `L ${p(cx, cy, size, -0.28, 0.34)} C ${p(cx, cy, size, -0.4, 0.32)}, ${p(cx, cy, size, -0.47, 0.26)}, ${p(cx, cy, size, -0.48, 0.2)} Z`,
  ].join(" ");
}

function buildFlowerPath(cx: number, cy: number, size: number, variant: number): string {
  const petals = 5 + (variant % 3);
  const outer = Array.from({ length: petals * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? 0.5 : 0.22;
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / (petals * 2);
    return p(cx, cy, size, Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  return `M ${outer.join(" L ")} Z`;
}

function buildHousePath(cx: number, cy: number, size: number, variant: number): string {
  const roof = variant % 2 === 0 ? -0.52 : -0.44;
  return [
    `M ${p(cx, cy, size, -0.48, -0.08)} L ${p(cx, cy, size, 0, roof)} L ${p(cx, cy, size, 0.48, -0.08)}`,
    `L ${p(cx, cy, size, 0.38, -0.08)} L ${p(cx, cy, size, 0.38, 0.46)} L ${p(cx, cy, size, -0.38, 0.46)} L ${p(cx, cy, size, -0.38, -0.08)} Z`,
  ].join(" ");
}

function buildPylonPath(cx: number, cy: number, size: number, variant: number): string {
  const top = variant % 2 === 0 ? 0.1 : 0.16;
  return [
    `M ${p(cx, cy, size, -0.1, -0.5)} L ${p(cx, cy, size, 0.1, -0.5)} L ${p(cx, cy, size, 0.5, 0.5)} L ${p(cx, cy, size, 0.22, 0.5)}`,
    `L ${p(cx, cy, size, 0.08, top)} L ${p(cx, cy, size, -0.08, top)} L ${p(cx, cy, size, -0.22, 0.5)} L ${p(cx, cy, size, -0.5, 0.5)} Z`,
  ].join(" ");
}

function buildInsectPath(cx: number, cy: number, size: number, variant: number): string {
  const wing = variant % 2 === 0 ? 0.5 : 0.44;
  return [
    `M ${p(cx, cy, size, 0, -0.44)} C ${p(cx, cy, size, -wing, -0.58)}, ${p(cx, cy, size, -0.58, 0.08)}, ${p(cx, cy, size, -0.08, 0.1)}`,
    `L ${p(cx, cy, size, -0.08, 0.48)} L ${p(cx, cy, size, 0.08, 0.48)} L ${p(cx, cy, size, 0.08, 0.1)}`,
    `C ${p(cx, cy, size, 0.58, 0.08)}, ${p(cx, cy, size, wing, -0.58)}, ${p(cx, cy, size, 0, -0.44)} Z`,
  ].join(" ");
}
