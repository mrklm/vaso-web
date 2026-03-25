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
  unlockAdvancedStlParams: boolean;

  // Printer profiles
  printerProfiles: PrinterProfile[];
  activePrinterProfile: string;
  enforcePrinterVolume: boolean;

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
  setUnlockAdvancedStlParams: (enabled: boolean) => void;

  // Printer profile actions
  setEnforcePrinterVolume: (enabled: boolean) => void;
  setActivePrinterProfile: (name: string) => void;
  addPrinterProfile: (profile: PrinterProfile) => void;
  updatePrinterProfile: (name: string, profile: PrinterProfile) => void;
  deletePrinterProfile: (name: string) => void;
}

const DEFAULT_PRINTER_PROFILES: PrinterProfile[] = [
  { name: "Alfawise U30", width: 220, depth: 220, height: 250 },
  { name: "Ender 5 Pro", width: 220, depth: 220, height: 300 },
  { name: "Bambu Lab A1 Mini", width: 180, depth: 180, height: 180 },
  { name: "Bambu Lab A1", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab P1S", width: 256, depth: 256, height: 256 },
  { name: "Prusa MINI+", width: 180, depth: 180, height: 180 },
  { name: "Prusa MK4S", width: 250, depth: 210, height: 220 },
  { name: "Prusa CORE One", width: 250, depth: 220, height: 270 },
  { name: "Creality Ender-3 V3 SE", width: 220, depth: 220, height: 250 },
  { name: "Creality Ender-3 V3 KE", width: 220, depth: 220, height: 240 },
  { name: "Creality K1C", width: 220, depth: 220, height: 250 },
  { name: "ELEGOO Neptune 4 Pro", width: 225, depth: 225, height: 265 },
];

function loadPrinterProfiles(): { profiles: PrinterProfile[]; active: string; enforce: boolean } {
  try {
    const saved = localStorage.getItem("vaso-printer-profiles");
    if (saved) {
      const data = JSON.parse(saved);
      if (data.profiles?.length > 0) {
        return {
          profiles: data.profiles,
          active: data.active ?? data.profiles[0].name,
          enforce: data.enforce === true,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    profiles: DEFAULT_PRINTER_PROFILES,
    active: DEFAULT_PRINTER_PROFILES[0].name,
    enforce: false,
  };
}

function savePrinterProfiles(profiles: PrinterProfile[], active: string, enforce: boolean) {
  try {
    localStorage.setItem("vaso-printer-profiles", JSON.stringify({ profiles, active, enforce }));
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

function loadSavedAdvancedStlUnlock(): boolean {
  try {
    return localStorage.getItem("vaso-advanced-stl-unlocked") === "true";
  } catch {
    /* ignore */
  }
  return false;
}

const initialTheme = loadSavedTheme();
applyThemeToCSS(initialTheme);

const initialPrinter = loadPrinterProfiles();
const initialAdvancedStlUnlock = loadSavedAdvancedStlUnlock();

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
  unlockAdvancedStlParams: initialAdvancedStlUnlock,

  printerProfiles: initialPrinter.profiles,
  activePrinterProfile: initialPrinter.active,
  enforcePrinterVolume: initialPrinter.enforce,

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
  setUnlockAdvancedStlParams: (enabled) => {
    try {
      localStorage.setItem("vaso-advanced-stl-unlocked", String(enabled));
    } catch {
      /* ignore */
    }
    set({ unlockAdvancedStlParams: enabled });
  },

  setEnforcePrinterVolume: (enabled) => {
    set({ enforcePrinterVolume: enabled });
    savePrinterProfiles(get().printerProfiles, get().activePrinterProfile, enabled);
  },
  setActivePrinterProfile: (name) => {
    set({ activePrinterProfile: name });
    savePrinterProfiles(get().printerProfiles, name, get().enforcePrinterVolume);
  },
  addPrinterProfile: (profile) => {
    const profiles = [...get().printerProfiles, profile];
    set({ printerProfiles: profiles, activePrinterProfile: profile.name });
    savePrinterProfiles(profiles, profile.name, get().enforcePrinterVolume);
  },
  updatePrinterProfile: (name, profile) => {
    const profiles = get().printerProfiles.map((p) => (p.name === name ? profile : p));
    set({ printerProfiles: profiles });
    savePrinterProfiles(profiles, get().activePrinterProfile, get().enforcePrinterVolume);
  },
  deletePrinterProfile: (name) => {
    const profiles = get().printerProfiles.filter((p) => p.name !== name);
    if (profiles.length === 0) return;
    const active = get().activePrinterProfile === name ? profiles[0].name : get().activePrinterProfile;
    set({ printerProfiles: profiles, activePrinterProfile: active });
    savePrinterProfiles(profiles, active, get().enforcePrinterVolume);
  },
}));
