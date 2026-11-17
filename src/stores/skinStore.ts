import { create } from "zustand";
import { api, errorMessage } from "../lib/ipc";
import type { SkinManifest, SkinTheme } from "../lib/ipc";

interface SkinState {
  activeSkin: SkinManifest | null;
  skins: SkinManifest[];
  isLoading: boolean;
  error: string | null;

  refreshSkins: () => Promise<void>;
  setSkin: (id: string) => Promise<void>;
  saveCustomSkin: (manifest: SkinManifest) => Promise<void>;
  deleteSkin: (id: string) => Promise<void>;
  exportSkinPack: (id: string, destPath: string) => Promise<void>;
  importSkinPack: (zipPath: string) => Promise<void>;
  applyThemeToDom: (theme: SkinTheme) => void;
}

const defaultSkinManifest: SkinManifest = {
  metadata: {
    id: "classic-club",
    name: "Classic Club",
    author: "Kangpcode",
    version: "1.0.0",
    description: "Tata letak standar klub profesional: 2 CDJ deck, mixer 2 channel di tengah, dan waveform bertumpuk.",
  },
  theme: {
    primaryColor: "#00e5ff",
    accentDeckA: "#00e5ff",
    accentDeckB: "#ff007f",
    backgroundColor: "#090d16",
    surfaceColor: "#0e1526",
    panelBorderColor: "#1c2842",
    textColor: "#f1f5f9",
    fontFamily: "Inter, sans-serif",
  },
  layout: {
    deckCount: 2,
    waveform: {
      position: "top-stacked",
      orientation: "horizontal",
      heightPx: 110,
      showBeatgrid: true,
    },
    platter: {
      size: "standard",
      vinylTexture: true,
      centerDisplay: true,
    },
    mixer: {
      position: "center",
      channelCount: 2,
      vuMeterStyle: "segmented",
      crossfaderHeightPx: 56,
    },
    lowerPanelDefault: "library",
    showPhaseStrip: true,
    showScratchPads: false,
  },
};

export const useSkinStore = create<SkinState>((set, get) => ({
  activeSkin: defaultSkinManifest,
  skins: [defaultSkinManifest],
  isLoading: false,
  error: null,

  applyThemeToDom: (theme: SkinTheme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    root.style.setProperty("--skin-primary", theme.primaryColor);
    root.style.setProperty("--skin-accent-a", theme.accentDeckA);
    root.style.setProperty("--skin-accent-b", theme.accentDeckB);
    root.style.setProperty("--skin-bg", theme.backgroundColor);
    root.style.setProperty("--skin-surface", theme.surfaceColor);
    root.style.setProperty("--skin-border", theme.panelBorderColor);
    root.style.setProperty("--skin-text", theme.textColor);
    if (theme.fontFamily) {
      root.style.setProperty("--skin-font", theme.fontFamily);
    }

    // Injeksi custom CSS dinamis jika ada
    let styleEl = document.getElementById("djdex-skin-custom-css") as HTMLStyleElement | null;
    if (theme.customCss) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "djdex-skin-custom-css";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = theme.customCss;
    } else if (styleEl) {
      styleEl.remove();
    }
  },

  refreshSkins: async () => {
    try {
      const [activeSkin, skins] = await Promise.all([
        api.getActiveSkin().catch(() => defaultSkinManifest),
        api.listSkins().catch(() => [defaultSkinManifest]),
      ]);
      set({ activeSkin, skins });
      get().applyThemeToDom(activeSkin.theme);
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setSkin: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const skin = await api.setActiveSkin(id);
      set({ activeSkin: skin, isLoading: false });
      get().applyThemeToDom(skin.theme);
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  saveCustomSkin: async (manifest: SkinManifest) => {
    set({ isLoading: true, error: null });
    try {
      const saved = await api.saveCustomSkin(manifest);
      set({ activeSkin: saved, isLoading: false });
      get().applyThemeToDom(saved.theme);
      await get().refreshSkins();
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  deleteSkin: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteSkin(id);
      await get().refreshSkins();
      set({ isLoading: false });
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  exportSkinPack: async (id: string, destPath: string) => {
    try {
      await api.exportSkinPack(id, destPath);
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  importSkinPack: async (zipPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const imported = await api.importSkinPack(zipPath);
      set({ activeSkin: imported, isLoading: false });
      get().applyThemeToDom(imported.theme);
      await get().refreshSkins();
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },
}));
