import { create } from "zustand";
import { THEMES, applyThemeToCSS, type Theme } from "../themes";

interface PrinterProfile {
  name: string;
  width: number;
  depth: number;
  height: number;
}

interface UIState {
  theme: Theme;
  activeTab: "general" | "options" | "help";
  shading: number; // 0-100
  showGrid: boolean;
  vaseColor: string;
  wireframe: boolean;
  flatShading: boolean;
  autoRotate: boolean;
  showClipping: boolean;
  rotationMode: "camera" | "vase";
  rotationSpeed: number;
  clippingHeight: number; // 0-100 percent

  // Printer profiles
  printerProfiles: PrinterProfile[];
  activePrinterProfile: string;

  setTheme: (theme: Theme) => void;
  setActiveTab: (tab: UIState["activeTab"]) => void;
  setShading: (v: number) => void;
  setShowGrid: (v: boolean) => void;
  setVaseColor: (c: string) => void;
  setWireframe: (v: boolean) => void;
  setFlatShading: (v: boolean) => void;
  setAutoRotate: (v: boolean) => void;
  setShowClipping: (v: boolean) => void;
  setRotationMode: (mode: "camera" | "vase") => void;
  setRotationSpeed: (v: number) => void;
  setClippingHeight: (v: number) => void;

  // Printer profile actions
  setActivePrinterProfile: (name: string) => void;
  addPrinterProfile: (profile: PrinterProfile) => void;
  updatePrinterProfile: (name: string, profile: PrinterProfile) => void;
  deletePrinterProfile: (name: string) => void;
}

const DEFAULT_PRINTER_PROFILES: PrinterProfile[] = [
  { name: "Ender 5", width: 220, depth: 220, height: 300 },
  { name: "Bambu A1 Mini", width: 180, depth: 180, height: 180 },
  { name: "Prusa MK4", width: 250, depth: 210, height: 220 },
];

function loadPrinterProfiles(): { profiles: PrinterProfile[]; active: string } {
  try {
    const saved = localStorage.getItem("vaso-printer-profiles");
    if (saved) {
      const data = JSON.parse(saved);
      if (data.profiles?.length > 0) return data;
    }
  } catch {
    /* ignore */
  }
  return { profiles: DEFAULT_PRINTER_PROFILES, active: DEFAULT_PRINTER_PROFILES[0].name };
}

function savePrinterProfiles(profiles: PrinterProfile[], active: string) {
  try {
    localStorage.setItem("vaso-printer-profiles", JSON.stringify({ profiles, active }));
  } catch {
    /* ignore */
  }
}

// Load saved theme from localStorage
function loadSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem("vaso-theme");
    if (saved) {
      const found = THEMES.find((t) => t.name === saved);
      if (found) return found;
    }
  } catch {
    /* ignore */
  }
  return THEMES[0]; // Default: Midnight Garage
}

const initialTheme = loadSavedTheme();
applyThemeToCSS(initialTheme);

const initialPrinter = loadPrinterProfiles();

export const useUIStore = create<UIState>((set, get) => ({
  theme: initialTheme,
  activeTab: "general",
  shading: 70,
  showGrid: true,
  vaseColor: "#c4956a",
  wireframe: false,
  flatShading: false,
  autoRotate: true,
  showClipping: false,
  rotationMode: "camera",
  rotationSpeed: 0.5,
  clippingHeight: 50,

  printerProfiles: initialPrinter.profiles,
  activePrinterProfile: initialPrinter.active,

  setTheme: (theme) => {
    applyThemeToCSS(theme);
    try {
      localStorage.setItem("vaso-theme", theme.name);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShading: (v) => set({ shading: v }),
  setShowGrid: (v) => set({ showGrid: v }),
  setVaseColor: (c) => set({ vaseColor: c }),
  setWireframe: (v) => set({ wireframe: v }),
  setFlatShading: (v) => set({ flatShading: v }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setShowClipping: (v) => set({ showClipping: v }),
  setRotationMode: (mode) => set({ rotationMode: mode }),
  setRotationSpeed: (v) => set({ rotationSpeed: v }),
  setClippingHeight: (v) => set({ clippingHeight: v }),

  setActivePrinterProfile: (name) => {
    set({ activePrinterProfile: name });
    savePrinterProfiles(get().printerProfiles, name);
  },
  addPrinterProfile: (profile) => {
    const profiles = [...get().printerProfiles, profile];
    set({ printerProfiles: profiles, activePrinterProfile: profile.name });
    savePrinterProfiles(profiles, profile.name);
  },
  updatePrinterProfile: (name, profile) => {
    const profiles = get().printerProfiles.map((p) => (p.name === name ? profile : p));
    set({ printerProfiles: profiles });
    savePrinterProfiles(profiles, get().activePrinterProfile);
  },
  deletePrinterProfile: (name) => {
    const profiles = get().printerProfiles.filter((p) => p.name !== name);
    if (profiles.length === 0) return;
    const active = get().activePrinterProfile === name ? profiles[0].name : get().activePrinterProfile;
    set({ printerProfiles: profiles, activePrinterProfile: active });
    savePrinterProfiles(profiles, active);
  },
}));
