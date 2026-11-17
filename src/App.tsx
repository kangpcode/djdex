import { useEffect, useState } from "react";

import { AudioEnginePanel } from "./components/AudioEnginePanel";
import { DeckPanel } from "./components/DeckPanel";
import { FxPanel } from "./components/FxPanel";
import { Header } from "./components/Header";
import { LibraryPanel } from "./components/LibraryPanel";
import { MixerPanel } from "./components/MixerPanel";
import { PhaseStrip } from "./components/PhaseStrip";
import { SamplerPanel } from "./components/SamplerPanel";
import { ToneTestPanel } from "./components/ToneTestPanel";
import { isTauri } from "./lib/ipc";
import { useAudioStore } from "./stores/audioStore";
import { useAutoDjStore } from "./stores/autoDjStore";
import { useDeckAStore, useDeckBStore } from "./stores/deckStore";
import { useLibraryStore } from "./stores/libraryStore";
import { useMixerStore } from "./stores/mixerStore";
import { useSamplerStore } from "./stores/samplerStore";

const STATUS_POLL_MS = 100;

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "wav",
  "ogg",
  "aac",
  "m4a",
  "aiff",
  "aif",
  "alac",
]);

function isAudioPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.has(extension);
}

type LowerTab = "library" | "sampler" | "fx" | "engine" | "all";

export default function App() {
  const status = useAudioStore((state) => state.status);
  const refreshDevices = useAudioStore((state) => state.refreshDevices);
  const refreshStatus = useAudioStore((state) => state.refreshStatus);
  const engineInitialized = useAudioStore((state) => Boolean(state.status?.initialized));

  const refreshDeckA = useDeckAStore((state) => state.refresh);
  const loadTrackA = useDeckAStore((state) => state.load);
  const togglePlayA = useDeckAStore((state) => state.toggle);
  const refreshDeckB = useDeckBStore((state) => state.refresh);
  const refreshMixer = useMixerStore((state) => state.refresh);
  const refreshAutoDj = useAutoDjStore((state) => state.refresh);

  const refreshSampler = useSamplerStore((state) => state.refresh);
  const triggerSamplerPad = useSamplerStore((state) => state.triggerPad);

  const refreshPreview = useLibraryStore((state) => state.refreshPreview);
  const refreshProgress = useLibraryStore((state) => state.refreshProgress);

  const [lowerTab, setLowerTab] = useState<LowerTab>("library");

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (!engineInitialized) {
      return;
    }

    void refreshDeckA();
    void refreshDeckB();
    void refreshMixer();
    void refreshAutoDj();
    void refreshSampler();
    void refreshPreview();
    void refreshProgress();

    const timer = window.setInterval(() => {
      void refreshStatus();
      void refreshDeckA();
      void refreshDeckB();
      void refreshMixer();
      void refreshAutoDj();
      void refreshSampler();
      void refreshPreview();
      void refreshProgress();
    }, STATUS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [
    engineInitialized,
    refreshStatus,
    refreshDeckA,
    refreshDeckB,
    refreshMixer,
    refreshAutoDj,
    refreshSampler,
    refreshPreview,
    refreshProgress,
  ]);

  // Drag & drop file audio dari OS ke jendela aplikasi.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const stop = await getCurrentWindow().onDragDropEvent((event) => {
          if (event.payload.type !== "drop") {
            return;
          }
          const path = event.payload.paths.find(isAudioPath);
          if (path) {
            void loadTrackA(path);
          }
        });

        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch {
        // Drag & drop opsional; pengguna tetap bisa memakai dialog file.
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [loadTrackA]);

  // Shortcut keyboard global: Space = play/pause Deck A, 1..8 = Trigger Sampler Pads
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        void togglePlayA();
        return;
      }

      // Tombol angka 1-8 memicu Pad 1-8
      if (/^[1-8]$/.test(event.key)) {
        const padIdx = parseInt(event.key, 10) - 1;
        void triggerSamplerPad(padIdx, 1.0);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlayA, triggerSamplerPad]);

  return (
    <div className="app-shell app-grid relative flex h-full flex-col overflow-hidden">
      <Header status={status} />

      <main className="relative z-10 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
          {/* Dual Deck & Mixer Section */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)_minmax(0,1fr)] xl:items-start">
            <DeckPanel deck={0} />
            <MixerPanel />
            <DeckPanel deck={1} />
          </div>

          {/* Lower Performance Panel Tabs */}
          <div className="flex items-center justify-between border-b border-line/60 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLowerTab("library")}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                  lowerTab === "library"
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(0,229,255,0.25)]"
                    : "border-line bg-deck-900/60 text-ink-muted hover:text-ink"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                Library & Crates
              </button>

              <button
                type="button"
                onClick={() => setLowerTab("sampler")}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                  lowerTab === "sampler"
                    ? "border-pink-400 bg-pink-500/20 text-pink-300 shadow-[0_0_10px_rgba(244,114,182,0.25)]"
                    : "border-line bg-deck-900/60 text-ink-muted hover:text-ink"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-pink-400" />
                Remixer / Sampler & 16-Step Sequencer
              </button>

              <button
                type="button"
                onClick={() => setLowerTab("fx")}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                  lowerTab === "fx"
                    ? "border-purple-400 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.25)]"
                    : "border-line bg-deck-900/60 text-ink-muted hover:text-ink"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-purple-400" />
                FX Chains & Auto DJ
              </button>

              <button
                type="button"
                onClick={() => setLowerTab("engine")}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                  lowerTab === "engine"
                    ? "border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                    : "border-line bg-deck-900/60 text-ink-muted hover:text-ink"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Audio Output & Diagnostics
              </button>
            </div>

            <button
              type="button"
              onClick={() => setLowerTab(lowerTab === "all" ? "library" : "all")}
              className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition ${
                lowerTab === "all"
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                  : "border-line bg-deck-900 text-ink-muted hover:text-ink"
              }`}
            >
              {lowerTab === "all" ? "Single Tab View" : "Show All Panels"}
            </button>
          </div>

          {/* Tab Views */}
          {(lowerTab === "library" || lowerTab === "all") && <LibraryPanel />}

          {(lowerTab === "sampler" || lowerTab === "all") && <SamplerPanel />}

          {(lowerTab === "fx" || lowerTab === "all") && <FxPanel />}

          {(lowerTab === "engine" || lowerTab === "all") && (
            <div className="grid gap-5 lg:grid-cols-2">
              <AudioEnginePanel />
              <ToneTestPanel />
            </div>
          )}

          <PhaseStrip />
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-deck-950/70 px-5 py-2 text-[10.5px] text-ink-faint">
        <span className="font-display tracking-[0.18em] text-ink-dim">DJDeX</span>
        <span>By Kangpcode · v0.8.0</span>
        <span className="hidden sm:inline">
          Rust + Tauri 2 · SQLite Library · Batch Analyzer · Crates & Playlists · Cue Preview
        </span>
        <span className="ml-auto hidden md:inline">
          Space = play/pause · Headphone = Cue Preview · Drag to Deck A/B
        </span>
      </footer>
    </div>
  );
}
