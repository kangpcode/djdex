import { create } from "zustand";

import {
  errorMessage,
  ipc,
  type AutoDjStatus,
  type AutoDjUpdate,
} from "../lib/ipc";

interface AutoDjStore {
  status: AutoDjStatus | null;
  error: string | null;

  refresh: () => Promise<void>;
  update: (patch: AutoDjUpdate) => Promise<void>;
  trigger: () => Promise<void>;
  cancel: () => Promise<void>;
  clearError: () => void;
}

export const useAutoDjStore = create<AutoDjStore>((set) => ({
  status: null,
  error: null,

  refresh: async () => {
    try {
      const status = await ipc.getAutoDjStatus();
      set({ status, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  update: async (patch) => {
    try {
      const status = await ipc.setAutoDj(patch);
      set({ status, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  trigger: async () => {
    try {
      const status = await ipc.triggerAutoDj();
      set({ status, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  cancel: async () => {
    try {
      const status = await ipc.cancelAutoDj();
      set({ status, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  clearError: () => set({ error: null }),
}));
