import { useEffect } from "react";

import { AudioEnginePanel } from "./components/AudioEnginePanel";
import { FxPanel } from "./components/FxPanel";
import { DeckPanel } from "./components/DeckPanel";
import { Header } from "./components/Header";
import { MixerPanel } from "./components/MixerPanel";
import { PhaseStrip } from "./components/PhaseStrip";
import { ToneTestPanel } from "./components/ToneTestPanel";
import { isTauri } from "./lib/ipc";
import { useAudioStore } from "./stores/audioStore";
import { useDeckAStore, useDeckBStore } from "./stores/deckStore";
import { useMixerStore } from "./stores/mixerStore";

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
    const timer = window.setInterval(() => {
      void refreshStatus();
      void refreshDeckA();
      void refreshDeckB();
      void refreshMixer();
    }, STATUS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [engineInitialized, refreshStatus, refreshDeckA, refreshDeckB, refreshMixer]);

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

  // Shortcut global sementara; mapping lengkap ada di Fase 9.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

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

      event.preventDefault();
      void togglePlayA();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlayA]);

  return (
    <div className="app-shell app-grid relative flex h-full flex-col overflow-hidden">
      <Header status={status} />

      <main className="relative z-10 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)_minmax(0,1fr)] xl:items-start">
            <DeckPanel deck={0} />
            <MixerPanel />
            <DeckPanel deck={1} />
          </div>

          <FxPanel />

          <div className="grid gap-5 lg:grid-cols-2">
            <AudioEnginePanel />
            <ToneTestPanel />
          </div>

          <PhaseStrip />
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-deck-950/70 px-5 py-2 text-[10.5px] text-ink-faint">
        <span className="font-display tracking-[0.18em] text-ink-dim">DJDeX</span>
        <span>By Kangpcode · v0.5.0</span>
        <span className="hidden sm:inline">
          Rust + Tauri 2 · Symphonia · CPAL · ring buffer lock-free
        </span>
        <span className="ml-auto hidden md:inline">
          Space = play/pause · target latensi &lt; 15 ms
        </span>
      </footer>
    </div>
  );
}
