import { create } from "zustand";
import { api, errorMessage } from "../lib/ipc";
import type {
  DjAction,
  KeyboardBinding,
  MidiLearnStatus,
  MidiMapping,
  MidiPortInfo,
  MidiStatus,
} from "../lib/ipc";

export interface MidiActivityItem {
  id: string;
  timestamp: number;
  channel: number;
  messageType: string;
  control: number;
  value: number;
  actionDesc?: string;
}

interface MidiState {
  inputs: MidiPortInfo[];
  outputs: MidiPortInfo[];
  selectedInputId: number | null;
  selectedOutputId: number | null;
  status: MidiStatus;
  mappings: MidiMapping[];
  presets: string[];
  learnStatus: MidiLearnStatus;
  keyboardBindings: KeyboardBinding[];
  activityLogs: MidiActivityItem[];
  isLoading: boolean;
  error: string | null;

  refreshPorts: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  connect: (inputIndex?: number, outputIndex?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  startLearn: (action: DjAction) => Promise<void>;
  cancelLearn: () => Promise<void>;
  fetchMappings: () => Promise<void>;
  setMapping: (mapping: MidiMapping) => Promise<void>;
  removeMapping: (id: string) => Promise<void>;
  clearMappings: () => Promise<void>;
  fetchPresets: () => Promise<void>;
  loadPreset: (name: string) => Promise<void>;
  savePreset: (name: string) => Promise<void>;
  fetchKeyboardBindings: () => Promise<void>;
  setKeyboardBinding: (binding: KeyboardBinding) => Promise<void>;
  removeKeyboardBinding: (
    key: string,
    ctrl?: boolean,
    shift?: boolean,
    alt?: boolean,
  ) => Promise<void>;
  resetKeyboardBindings: () => Promise<void>;
  handleKeyShortcut: (
    key: string,
    ctrl: boolean,
    shift: boolean,
    alt: boolean,
  ) => Promise<DjAction | null>;
  clearLogs: () => void;
}

const initialStatus: MidiStatus = {
  connectedInput: null,
  connectedOutput: null,
  isLearning: false,
  activePreset: "Pioneer DDJ-400 / DDJ-FLX4",
  mappingCount: 0,
  lastEvent: null,
};

export const useMidiStore = create<MidiState>((set, get) => ({
  inputs: [],
  outputs: [],
  selectedInputId: null,
  selectedOutputId: null,
  status: initialStatus,
  mappings: [],
  presets: [],
  learnStatus: { isLearning: false, targetAction: null, lastEvent: null },
  keyboardBindings: [],
  activityLogs: [],
  isLoading: false,
  error: null,

  refreshPorts: async () => {
    try {
      const [inputs, outputs] = await Promise.all([
        api.listMidiInputs().catch(() => []),
        api.listMidiOutputs().catch(() => []),
      ]);
      set({ inputs, outputs });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  refreshStatus: async () => {
    try {
      const status = await api.getMidiStatus();
      set({ status });

      // Catat event ke log jika ada
      if (status.lastEvent) {
        const last = status.lastEvent;
        const logItem: MidiActivityItem = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          channel: last.channel,
          messageType: last.messageType,
          control: last.control,
          value: last.value,
        };
        set((state) => ({
          activityLogs: [logItem, ...state.activityLogs].slice(0, 50),
        }));
      }
    } catch {
      // Ignored saat offline/bukan Tauri
    }
  },

  connect: async (inputIndex, outputIndex) => {
    set({ isLoading: true, error: null });
    try {
      const status = await api.connectMidiDevice(inputIndex, outputIndex);
      set({
        status,
        selectedInputId: inputIndex ?? null,
        selectedOutputId: outputIndex ?? null,
        isLoading: false,
      });
      await get().fetchMappings();
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  disconnect: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await api.disconnectMidiDevice();
      set({
        status,
        selectedInputId: null,
        selectedOutputId: null,
        isLoading: false,
      });
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  startLearn: async (action) => {
    try {
      const learnStatus = await api.startMidiLearn(action);
      set({ learnStatus, error: null });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  cancelLearn: async () => {
    try {
      const learnStatus = await api.cancelMidiLearn();
      set({ learnStatus });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  fetchMappings: async () => {
    try {
      const mappings = await api.getMidiMappings();
      set({ mappings });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setMapping: async (mapping) => {
    try {
      await api.setMidiMapping(mapping);
      await get().fetchMappings();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  removeMapping: async (id) => {
    try {
      await api.removeMidiMapping(id);
      await get().fetchMappings();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  clearMappings: async () => {
    try {
      await api.clearMidiMappings();
      await get().fetchMappings();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  fetchPresets: async () => {
    try {
      const presets = await api.listMidiPresets();
      set({ presets });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  loadPreset: async (name) => {
    set({ isLoading: true, error: null });
    try {
      const status = await api.loadMidiPreset(name);
      set({ status, isLoading: false });
      await get().fetchMappings();
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  savePreset: async (name) => {
    set({ isLoading: true, error: null });
    try {
      const status = await api.saveMidiPreset(name);
      set({ status, isLoading: false });
      await get().fetchPresets();
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  fetchKeyboardBindings: async () => {
    try {
      const keyboardBindings = await api.getKeyboardMappings();
      set({ keyboardBindings });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setKeyboardBinding: async (binding) => {
    try {
      await api.setKeyboardMapping(binding);
      await get().fetchKeyboardBindings();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  removeKeyboardBinding: async (key, ctrl, shift, alt) => {
    try {
      await api.removeKeyboardMapping(key, ctrl, shift, alt);
      await get().fetchKeyboardBindings();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  resetKeyboardBindings: async () => {
    try {
      const keyboardBindings = await api.resetKeyboardMappings();
      set({ keyboardBindings });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  handleKeyShortcut: async (key, ctrl, shift, alt) => {
    try {
      return await api.handleKeyboardShortcut(key, ctrl, shift, alt);
    } catch {
      return null;
    }
  },

  clearLogs: () => set({ activityLogs: [] }),
}));
