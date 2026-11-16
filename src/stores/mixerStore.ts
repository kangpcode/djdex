import { create } from "zustand";

import { errorMessage, ipc, type MixerParams, type MixerUpdate } from "../lib/ipc";

interface MixerStore {
  status: MixerParams | null;
  pending: MixerUpdate;
  error: string | null;

  refresh: () => Promise<void>;
  update: (patch: MixerUpdate) => void;
  flush: () => Promise<void>;
  clearError: () => void;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useMixerStore = create<MixerStore>((set, get) => ({
  status: null,
  pending: {},
  error: null,

  refresh: async () => {
    try {
      const status = await ipc.getMixerStatus();
      // Jangan timpa nilai optimistis yang belum terkirim.
      if (Object.keys(get().pending).length === 0) {
        set({ status });
      }
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  update: (patch) => {
    const status = get().status;
    if (!status) {
      return;
    }

    // Optimistic agar fader/knob tetap responsif di antara polling. Channel
    // di-merge terpisah karena bentuknya array objek.
    const next: MixerParams = {
      ...status,
      ...patch,
      channels: [
        { ...status.channels[0], ...(patch.channelA ?? {}) },
        { ...status.channels[1], ...(patch.channelB ?? {}) },
      ],
    };
    const pending: MixerUpdate = {
      ...get().pending,
      ...patch,
      channelA: patch.channelA
        ? { ...get().pending.channelA, ...patch.channelA }
        : get().pending.channelA,
      channelB: patch.channelB
        ? { ...get().pending.channelB, ...patch.channelB }
        : get().pending.channelB,
    };
    set({ status: next, pending });

    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void get().flush();
    }, 40);
  },

  flush: async () => {
    const pending = get().pending;
    if (Object.keys(pending).length === 0) {
      return;
    }

    set({ pending: {} });
    try {
      const status = await ipc.setMixer(pending);
      set({ status, error: null });
    } catch (error) {
      // Kembalikan pending agar perubahan bisa dikirim ulang.
      set({ pending, error: errorMessage(error) });
    }
  },

  clearError: () => set({ error: null }),
}));
