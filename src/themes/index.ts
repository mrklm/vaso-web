export interface Theme {
  name: string;
  bg: string;
  panel: string;
  field: string;
  fg: string;
  fieldFg: string;
  accent: string;
  vase: string;
}

export const THEMES: Theme[] = [
  // Sombres
  {
    name: "[Sombre] Midnight Garage",
    bg: "#151515",
    panel: "#1F1F1F",
    field: "#2A2A2A",
    fg: "#EAEAEA",
    fieldFg: "#F0F0F0",
    accent: "#FF9800",
    vase: "#C4956A",
  },
  {
    name: "[Sombre] AIR-KLM Night flight",
    bg: "#0B1E2D",
    panel: "#102A3D",
    field: "#16384F",
    fg: "#EAF6FF",
    fieldFg: "#FFFFFF",
    accent: "#00A1DE",
    vase: "#59B8E8",
  },
  {
    name: "[Sombre] Café Serré",
    bg: "#1B120C",
    panel: "#2A1C14",
    field: "#3A281D",
    fg: "#F2E6D8",
    fieldFg: "#FFF4E6",
    accent: "#C28E5C",
    vase: "#A86F45",
  },
  {
    name: "[Sombre] Matrix Déjà Vu",
    bg: "#000A00",
    panel: "#001F00",
    field: "#003300",
    fg: "#00FF66",
    fieldFg: "#66FF99",
    accent: "#00FF00",
    vase: "#00A651",
  },
  {
    name: "[Sombre] Miami Vice 1987",
    bg: "#14002E",
    panel: "#2B0057",
    field: "#004D4D",
    fg: "#FFF0FF",
    fieldFg: "#FFFFFF",
    accent: "#00FFD5",
    vase: "#FF7CCB",
  },
  {
    name: "[Sombre] Cyber Licorne",
    bg: "#1A0026",
    panel: "#2E004F",
    field: "#3D0066",
    fg: "#F6E7FF",
    fieldFg: "#FFFFFF",
    accent: "#FF2CF7",
    vase: "#9B59FF",
  },
  // Clairs
  {
    name: "[Clair] AIR-KLM Day flight",
    bg: "#EAF6FF",
    panel: "#D6EEF9",
    field: "#FFFFFF",
    fg: "#0B2A3F",
    fieldFg: "#0B2A3F",
    accent: "#00A1DE",
    vase: "#59B8E8",
  },
  {
    name: "[Clair] Matin Brumeux",
    bg: "#E6E7E8",
    panel: "#D4D7DB",
    field: "#FFFFFF",
    fg: "#1E1F22",
    fieldFg: "#1E1F22",
    accent: "#6B7C93",
    vase: "#8C98A8",
  },
  {
    name: "[Clair] Latte Vanille",
    bg: "#FAF6F1",
    panel: "#EFE6DC",
    field: "#FFFFFF",
    fg: "#3D2E22",
    fieldFg: "#3D2E22",
    accent: "#D8B892",
    vase: "#CFA77A",
  },
  {
    name: "[Clair] Miellerie La Divette",
    bg: "#E6B65C",
    panel: "#F5E6CC",
    field: "#FFFFFF",
    fg: "#50371A",
    fieldFg: "#50371A",
    accent: "#F2B705",
    vase: "#D89A1D",
  },
  // Pouêt
  {
    name: "[Pouêt] Chewing-gum Océan",
    bg: "#00A6C8",
    panel: "#0083A1",
    field: "#00C7B7",
    fg: "#082026",
    fieldFg: "#082026",
    accent: "#FF4FD8",
    vase: "#FF8AAE",
  },
  {
    name: "[Pouêt] Pamplemousse",
    bg: "#FF4A1C",
    panel: "#E63B10",
    field: "#FF7A00",
    fg: "#1A0B00",
    fieldFg: "#1A0B00",
    accent: "#00E5FF",
    vase: "#FFB000",
  },
  {
    name: "[Pouêt] Raisin Toxique",
    bg: "#7A00FF",
    panel: "#5B00C9",
    field: "#B000FF",
    fg: "#0F001A",
    fieldFg: "#0F001A",
    accent: "#39FF14",
    vase: "#7E57C2",
  },
  {
    name: "[Pouêt] Citron qui pique",
    bg: "#FFF200",
    panel: "#E6D800",
    field: "#FFF7A6",
    fg: "#1A1A00",
    fieldFg: "#1A1A00",
    accent: "#0066FF",
    vase: "#FFD54A",
  },
  {
    name: "[Pouêt] Barbie Apocalypse",
    bg: "#FF1493",
    panel: "#004D40",
    field: "#1B5E20",
    fg: "#E8FFF8",
    fieldFg: "#FFFFFF",
    accent: "#FFEB3B",
    vase: "#FF5FA2",
  },
  {
    name: "[Pouêt] Compagnie Créole",
    bg: "#8B3A1A",
    panel: "#F2C94C",
    field: "#FFFFFF",
    fg: "#5A2E0C",
    fieldFg: "#5A2E0C",
    accent: "#8B3A1A",
    vase: "#2E9B5F",
  },
];

export function applyThemeToCSS(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--color-bg", theme.bg);
  root.style.setProperty("--color-panel", theme.panel);
  root.style.setProperty("--color-field", theme.field);
  root.style.setProperty("--color-fg", theme.fg);
  root.style.setProperty("--color-field-fg", theme.fieldFg);
  root.style.setProperty("--color-accent", theme.accent);
}
