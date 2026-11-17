import { create } from "zustand";

import {
  api,
  isTauri,
  type DeckId,
  type PadUpdate,
  type SamplerStatus,
  type SequencerUpdate,
} from "../lib/ipc";

interface SamplerState {
  status: SamplerStatus | null;
  activeBank: number;
  isGrid16: boolean;
  selectedPadId: number | null;
  error: string | null;

  refresh: () => Promise<void>;
  triggerPad: (pad: number, velocity?: number) => Promise<void>;
  releasePad: (pad: number) => Promise<void>;
  stopPad: (pad: number) => Promise<void>;
  stopAll: () => Promise<void>;
  selectBank: (bank: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  updatePad: (pad: number, update: PadUpdate) => Promise<void>;
  loadPadFile: (pad: number, path: string) => Promise<void>;
  captureDeck: (pad: number, deck?: DeckId, beats?: number) => Promise<void>;
  toggleSequencer: (running?: boolean) => Promise<void>;
  setSequencerStep: (track: number, step: number, active: boolean) => Promise<void>;
  setSequencerParams: (update: SequencerUpdate) => Promise<void>;
  exportPack: (path: string) => Promise<void>;
  importPack: (path: string) => Promise<void>;
  toggleGridSize: () => void;
  selectPad: (pad: number | null) => void;
}

export const useSamplerStore = create<SamplerState>((set, get) => ({
  status: null,
  activeBank: 0,
  isGrid16: true,
  selectedPadId: 0,
  error: null,

  refresh: async () => {
    if (!isTauri()) {
      return;
    }
    try {
      const status = await api.getSamplerStatus();
      set({
        status,
        activeBank: status.activeBank,
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  triggerPad: async (pad: number, velocity?: number) => {
    if (!isTauri()) {
      return;
    }
    try {
      await api.triggerSamplerPad(pad, velocity);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  releasePad: async (pad: number) => {
    if (!isTauri()) {
      return;
    }
    try {
      await api.releaseSamplerPad(pad);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  stopPad: async (pad: number) => {
    if (!isTauri()) {
      return;
    }
    try {
      await api.stopSamplerPad(pad);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  stopAll: async () => {
    if (!isTauri()) {
      return;
    }
    try {
      await api.stopAllSamplerPads();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  selectBank: async (bank: number) => {
    if (!isTauri()) {
      set({ activeBank: bank });
      return;
    }
    try {
      const status = await api.selectSamplerBank(bank);
      set({ status, activeBank: status.activeBank, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setVolume: async (volume: number) => {
    if (!isTauri()) {
      return;
    }
    try {
      const status = await api.setSamplerVolume(volume);
      set({ status, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updatePad: async (pad: number, update: PadUpdate) => {
    if (!isTauri()) {
      return;
    }
    try {
      const status = await api.updateSamplerPad(pad, update);
      set({ status, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadPadFile: async (pad: number, path: string) => {
    if (!isTauri()) {
      return;
    }
    try {
      const status = await api.loadSamplerPadFile(pad, path);
      set({ status, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  captureDeck: async (pad: number, deck: DeckId = 0, beats = 4) => {
    if (!isTauri()) {
      return;
    }
    try {
      const status = await api.captureDeckToPad(pad, deck, beats);
      set({ status, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  toggleSequencer: async (running?: boolean) => {
    if (!isTauri()) {
      return;
    }
    const currentRunning = get().status?.sequencer.running ?? false;
    const targetRunning = running ?? !currentRunning;
    try {
      const seq = await api.updateSequencer({ running: targetRunning });
      const current = get().status;
      if (current) {
        set({ status: { ...current, sequencer: seq }, error: null });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setSequencerStep: async (track: number, step: number, active: boolean) => {
    if (!isTauri()) {
      return;
    }
    try {
      const seq = await api.updateSequencer({ trackStep: [track, step, active] });
      const current = get().status;
      if (current) {
        set({ status: { ...current, sequencer: seq }, error: null });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setSequencerParams: async (update: SequencerUpdate) => {
    if (!isTauri()) {
      return;
    }
    try {
      const seq = await api.updateSequencer(update);
      const current = get().status;
      if (current) {
        set({ status: { ...current, sequencer: seq }, error: null });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  exportPack: async (path: string) => {
    if (!isTauri()) {
      return;
    }
    try {
      await api.exportSamplePack(path);
      set({ error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  importPack: async (path: string) => {
    if (!isTauri()) {
      return;
    }
    try {
      const status = await api.importSamplePack(path);
      set({ status, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  toggleGridSize: () => {
    set((state) => ({ isGrid16: !state.isGrid16 }));
  },

  selectPad: (pad: number | null) => {
    set({ selectedPadId: pad });
  },
}));
