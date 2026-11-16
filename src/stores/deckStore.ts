import { create } from "zustand";

import {
  errorMessage,
  ipc,
  type DeckId,
  type DeckStatus,
  type WaveformData,
} from "../lib/ipc";

const AUDIO_FILTERS = [
  {
    name: "Audio",
    extensions: ["mp3", "flac", "wav", "ogg", "aac", "m4a", "aiff", "aif", "alac"],
  },
];

export interface DeckStore {
  deck: DeckId;
  status: DeckStatus | null;
  waveform: WaveformData | null;
  waveformTrackId: number | null;
  pendingLoopIn: number | null;

  loading: boolean;
  busy: boolean;
  error: string | null;

  load: (path: string) => Promise<void>;
  chooseFile: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  toggle: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setCue: () => Promise<void>;
  cueJump: () => Promise<void>;
  setGainDb: (gainDb: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setPitchRange: (range: number) => Promise<void>;
  setKeylock: (enabled: boolean) => Promise<void>;
  setSemitones: (semitones: number) => Promise<void>;
  setBpm: (bpm: number) => Promise<void>;
  tapTempo: () => Promise<void>;
  setHotCueHere: (slot: number) => Promise<void>;
  triggerHotCue: (slot: number) => Promise<void>;
  clearHotCue: (slot: number) => Promise<void>;
  startLoop: (beats: number) => Promise<void>;
  manualLoopIn: () => void;
  manualLoopOut: () => Promise<void>;
  exitLoop: () => Promise<void>;
  halveLoop: () => Promise<void>;
  doubleLoop: () => Promise<void>;
  beatJump: (beats: number) => Promise<void>;
  syncToOther: () => Promise<void>;
  setBend: (bend: number) => void;
  resetBend: () => void;
  unload: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const deckLabel = (deck: DeckId) => (deck === 0 ? "A" : "B");

export function createDeckStore(deck: DeckId) {
  let gainTimer: ReturnType<typeof setTimeout> | null = null;
  let speedTimer: ReturnType<typeof setTimeout> | null = null;
  let bendTimer: ReturnType<typeof setTimeout> | null = null;
  let tapTimes: number[] = [];

  return create<DeckStore>((set, get) => {
    const applyStatus = (status: DeckStatus) => {
      set({ status });
      void fetchWaveform(status);
    };

    const fetchWaveform = async (status: DeckStatus) => {
      if (!status.waveformReady || status.trackId === get().waveformTrackId) {
        return;
      }
      try {
        const waveform = await ipc.getWaveform(deck, 4096);
        if (waveform && waveform.trackId === status.trackId) {
          set({ waveform, waveformTrackId: waveform.trackId });
        }
      } catch (error) {
        // Waveform opsional: playback tetap jalan walau analisis gagal.
        set({ error: errorMessage(error) });
      }
    };

    const setLoop = async (
      startSecs: number,
      endSecs: number,
      beats: number,
    ) => {
      try {
        applyStatus(
          await ipc.deckSetLoop(deck, startSecs, endSecs, beats),
        );
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    };

    const beatLength = (status: DeckStatus) =>
      status.bpm > 0 ? 60 / status.bpm : 0.5;

    return {
      deck,
      status: null,
      waveform: null,
      waveformTrackId: null,
      pendingLoopIn: null,
      loading: false,
      busy: false,
      error: null,

      load: async (path) => {
        set({ loading: true, error: null });
        try {
          const status = await ipc.loadTrack(deck, path);
          set({
            status,
            loading: false,
            waveform: null,
            waveformTrackId: null,
            pendingLoopIn: null,
          });
          void fetchWaveform(status);
        } catch (error) {
          set({ loading: false, error: errorMessage(error) });
        }
      },

      chooseFile: async () => {
        set({ error: null });
        try {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const selected = await open({
            multiple: false,
            directory: false,
            title: `Pilih track audio untuk Deck ${deckLabel(deck)}`,
            filters: AUDIO_FILTERS,
          });

          if (typeof selected === "string") {
            await get().load(selected);
          }
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      play: async () => {
        if (!get().status?.loaded) {
          return;
        }
        set({ busy: true, error: null });
        try {
          applyStatus(await ipc.deckPlay(deck));
        } catch (error) {
          set({ error: errorMessage(error) });
        } finally {
          set({ busy: false });
        }
      },

      pause: async () => {
        set({ busy: true, error: null });
        try {
          applyStatus(await ipc.deckPause(deck));
        } catch (error) {
          set({ error: errorMessage(error) });
        } finally {
          set({ busy: false });
        }
      },

      toggle: async () => {
        if (get().status?.playing) {
          await get().pause();
        } else {
          await get().play();
        }
      },

      seek: async (seconds) => {
        if (!get().status?.loaded) {
          return;
        }
        try {
          applyStatus(await ipc.deckSeek(deck, seconds));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      setCue: async () => {
        if (!get().status?.loaded) {
          return;
        }
        try {
          applyStatus(await ipc.deckSetCue(deck));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      cueJump: async () => {
        if (!get().status?.loaded) {
          return;
        }
        try {
          applyStatus(await ipc.deckCueJump(deck));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      setGainDb: async (gainDb) => {
        const status = get().status;
        if (!status) {
          return;
        }

        // Optimistic agar slider tetap responsif di antara polling 100 ms.
        set({ status: { ...status, gainDb } });

        if (gainTimer) {
          clearTimeout(gainTimer);
        }
        gainTimer = setTimeout(() => {
          gainTimer = null;
          const latest = get().status?.gainDb;
          if (latest == null) {
            return;
          }
          ipc
            .deckSetGain(deck, latest)
            .then(applyStatus)
            .catch((error: unknown) => set({ error: errorMessage(error) }));
        }, 50);
      },

      setSpeed: async (speed) => {
        const status = get().status;
        if (!status) {
          return;
        }

        // Optimistic agar fader mulus; kirim ke engine setelah 50 ms.
        set({ status: { ...status, speed } });

        if (speedTimer) {
          clearTimeout(speedTimer);
        }
        speedTimer = setTimeout(() => {
          speedTimer = null;
          const latest = get().status?.speed;
          if (latest == null) {
            return;
          }
          ipc
            .deckSetSpeed(deck, latest)
            .then(applyStatus)
            .catch((error: unknown) => set({ error: errorMessage(error) }));
        }, 50);
      },

      setPitchRange: async (range) => {
        const status = get().status;
        if (!status) {
          return;
        }

        const limit = range / 100;
        const speed = Math.min(1 + limit, Math.max(1 - limit, status.speed));
        set({ status: { ...status, pitchRange: range, speed } });

        try {
          applyStatus(await ipc.deckSetPitchRange(deck, range));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      setKeylock: async (enabled) => {
        const status = get().status;
        if (!status) {
          return;
        }
        set({ status: { ...status, keylock: enabled } });
        try {
          applyStatus(await ipc.deckSetKeylock(deck, enabled));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      setSemitones: async (semitones) => {
        const status = get().status;
        if (!status) {
          return;
        }
        const clamped = Math.min(12, Math.max(-12, Math.round(semitones)));
        set({ status: { ...status, semitones: clamped } });
        try {
          applyStatus(await ipc.deckSetSemitones(deck, clamped));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      setBpm: async (bpm) => {
        const status = get().status;
        if (!status || !Number.isFinite(bpm) || bpm <= 0) {
          return;
        }
        set({ status: { ...status, bpm } });
        try {
          applyStatus(await ipc.deckSetBpm(deck, bpm));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      tapTempo: async () => {
        if (!get().status?.loaded) {
          return;
        }

        const now = performance.now();
        if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2_000) {
          tapTimes = [];
        }
        tapTimes.push(now);
        if (tapTimes.length > 6) {
          tapTimes.shift();
        }
        if (tapTimes.length < 2) {
          return;
        }

        const intervals = tapTimes
          .slice(1)
          .map((time, index) => time - tapTimes[index])
          .sort((a, b) => a - b);
        const median = intervals[Math.floor(intervals.length / 2)];
        const bpm = Math.min(300, Math.max(40, 60_000 / median));
        await get().setBpm(Math.round(bpm * 100) / 100);
      },

      setHotCueHere: async (slot) => {
        if (!get().status?.loaded) {
          return;
        }
        try {
          applyStatus(await ipc.deckSetHotCue(deck, slot));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      triggerHotCue: async (slot) => {
        if (!get().status?.loaded) {
          return;
        }
        try {
          applyStatus(await ipc.deckTriggerHotCue(deck, slot));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      clearHotCue: async (slot) => {
        try {
          applyStatus(await ipc.deckClearHotCue(deck, slot));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      startLoop: async (beats) => {
        const status = get().status;
        if (!status?.loaded || status.bpm <= 0 || beats <= 0) {
          return;
        }
        const beat = beatLength(status);
        const grid = status.firstBeatSecs > 0 ? status.firstBeatSecs : 0;
        const start = Math.max(
          0,
          grid + Math.floor((status.positionSecs - grid) / beat + 1e-6) * beat,
        );
        await setLoop(start, start + beats * beat, beats);
      },

      manualLoopIn: () => {
        const status = get().status;
        if (status?.loaded) {
          set({ pendingLoopIn: status.positionSecs });
        }
      },

      manualLoopOut: async () => {
        const status = get().status;
        if (!status?.loaded) {
          return;
        }
        const start = get().pendingLoopIn ?? status.cueSecs;
        const end = status.positionSecs;
        if (end - start < 0.02) {
          return;
        }
        const beats =
          status.bpm > 0 ? (end - start) / beatLength(status) : 0;
        set({ pendingLoopIn: null });
        await setLoop(Math.min(start, end), Math.max(start, end), beats);
      },

      exitLoop: async () => {
        if (!get().status?.loaded) {
          return;
        }
        try {
          applyStatus(await ipc.deckExitLoop(deck));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      halveLoop: async () => {
        const status = get().status;
        if (!status?.loopActive) {
          return;
        }
        const beats = Math.max(1 / 32, status.loopBeats / 2);
        const beat = beatLength(status);
        await setLoop(
          status.loopStartSecs,
          status.loopStartSecs + beats * beat,
          beats,
        );
      },

      doubleLoop: async () => {
        const status = get().status;
        if (!status?.loopActive) {
          return;
        }
        const beats = Math.min(64, Math.max(1 / 32, status.loopBeats * 2));
        const beat = beatLength(status);
        await setLoop(
          status.loopStartSecs,
          status.loopStartSecs + beats * beat,
          beats,
        );
      },

      beatJump: async (beats) => {
        const status = get().status;
        if (!status?.loaded || status.bpm <= 0) {
          return;
        }
        try {
          applyStatus(
            await ipc.deckBeatJump(deck, (beats * 60) / status.bpm),
          );
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      syncToOther: async () => {
        const source = (deck === 0 ? 1 : 0) as DeckId;
        try {
          applyStatus(await ipc.syncDecks(source, deck));
          void deckStores[source].getState().refresh();
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      setBend: (bend) => {
        const status = get().status;
        if (status) {
          set({ status: { ...status, bend } });
        }
        if (bendTimer) {
          clearTimeout(bendTimer);
        }
        bendTimer = setTimeout(() => {
          bendTimer = null;
          ipc
            .deckSetBend(deck, bend)
            .then(applyStatus)
            .catch((error: unknown) => set({ error: errorMessage(error) }));
        }, 40);
      },

      resetBend: () => {
        const status = get().status;
        if (status) {
          set({ status: { ...status, bend: 1 } });
        }
        ipc
          .deckSetBend(deck, 1)
          .then(applyStatus)
          .catch((error: unknown) => set({ error: errorMessage(error) }));
      },

      unload: async () => {
        tapTimes = [];
        try {
          applyStatus(await ipc.deckUnload(deck));
          set({
            waveform: null,
            waveformTrackId: null,
            pendingLoopIn: null,
          });
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      refresh: async () => {
        try {
          applyStatus(await ipc.getDeckStatus(deck));
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },

      clearError: () => set({ error: null }),
    };
  });
}

export const useDeckAStore = createDeckStore(0);
export const useDeckBStore = createDeckStore(1);
export const deckStores = [useDeckAStore, useDeckBStore];
