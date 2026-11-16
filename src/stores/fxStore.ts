import { create } from "zustand";

import { errorMessage, ipc, type FxParams, type FxSlotUpdate } from "../lib/ipc";

interface FxStore {
  status: FxParams | null;
  error: string | null;

  refresh: () => Promise<void>;
  update: (patch: FxSlotUpdate) => Promise<void>;
  clearError: () => void;
}

export const useFxStore = create<FxStore>((set) => ({
  status: null,
  error: null,

  refresh: async () => {
    try {
      const status = await ipc.getFxStatus();
      set({ status, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  update: async (patch) => {
    try {
      const status = await ipc.setFx(patch);
      set({ status, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  clearError: () => set({ error: null }),
}));
