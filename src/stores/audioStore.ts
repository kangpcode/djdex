import { create } from "zustand";

import {
  errorMessage,
  ipc,
  type AudioDeviceInfo,
  type EngineStatus,
} from "../lib/ipc";

export const BUFFER_OPTIONS = [64, 128, 256, 512, 1024] as const;

export const TONE_MIN_HZ = 20;
export const TONE_MAX_HZ = 20_000;
export const TONE_MIN_DB = -60;
export const TONE_MAX_DB = 0;
export const TONE_DEFAULT_HZ = 440;
export const TONE_DEFAULT_DB = -12;

interface AudioStore {
  devices: AudioDeviceInfo[];
  devicesLoading: boolean;
  /** "" berarti device default sistem. */
  selectedDeviceId: string;
  bufferSize: number | null;
  sampleRate: number | null;
  /** null = auto (stereo). 4 channel memisahkan master 1/2 dan cue 3/4. */
  channels: number | null;

  toneFreqHz: number;
  toneGainDb: number;

  status: EngineStatus | null;
  busy: boolean;
  error: string | null;

  refreshDevices: () => Promise<void>;
  selectDevice: (id: string) => void;
  setBufferSize: (value: number | null) => void;
  setSampleRate: (value: number | null) => void;
  setChannels: (value: number | null) => void;
  /** Nyalakan engine sekali saat aplikasi dibuka (idempoten). */
  ensureEngine: () => Promise<void>;
  setToneFreq: (hz: number) => void;
  setToneGain: (db: number) => void;
  startEngine: () => Promise<void>;
  stopEngine: () => Promise<void>;
  setToneEnabled: (enabled: boolean) => Promise<void>;
  refreshStatus: () => Promise<void>;
  clearError: () => void;
}

let toneTimer: ReturnType<typeof setTimeout> | null = null;
let engineBoot: Promise<void> | null = null;

export const useAudioStore = create<AudioStore>((set, get) => {
  /** Kirim parameter tone terbaru ke engine, di-throttle agar drag tetap mulus. */
  const pushToneParams = () => {
    if (toneTimer) {
      clearTimeout(toneTimer);
    }
    toneTimer = setTimeout(() => {
      toneTimer = null;
      const { status, toneFreqHz, toneGainDb } = get();
      if (!status?.initialized) {
        return;
      }
      ipc
        .setTestTone({ freqHz: toneFreqHz, gainDb: toneGainDb })
        .then((next) => set({ status: next }))
        .catch((error: unknown) => set({ error: errorMessage(error) }));
    }, 60);
  };

  return {
    devices: [],
    devicesLoading: false,
    selectedDeviceId: "",
    bufferSize: 256,
    sampleRate: null,
    channels: null,

    toneFreqHz: TONE_DEFAULT_HZ,
    toneGainDb: TONE_DEFAULT_DB,

    status: null,
    busy: false,
    error: null,

    refreshDevices: async () => {
      set({ devicesLoading: true, error: null });
      try {
        const devices = await ipc.listAudioDevices();
        set({ devices, devicesLoading: false });

        // Jangan biarkan device yang sudah dicabut tetap terpilih diam-diam.
        const { selectedDeviceId } = get();
        if (
          selectedDeviceId &&
          !devices.some((device) => device.id === selectedDeviceId)
        ) {
          set({ selectedDeviceId: "" });
        }
      } catch (error) {
        set({
          devicesLoading: false,
          error: errorMessage(error),
        });
      }
    },

    selectDevice: (id) => set({ selectedDeviceId: id }),

    setBufferSize: (value) => set({ bufferSize: value }),

    setSampleRate: (value) => set({ sampleRate: value }),

    setChannels: (value) => set({ channels: value }),

    ensureEngine: async () => {
      if (get().status?.initialized) {
        return;
      }
      if (engineBoot) {
        return engineBoot;
      }
      engineBoot = get()
        .startEngine()
        .finally(() => {
          engineBoot = null;
        });
      return engineBoot;
    },

    setToneFreq: (hz) => {
      const clamped = Math.min(TONE_MAX_HZ, Math.max(TONE_MIN_HZ, hz));
      set({ toneFreqHz: clamped });
      pushToneParams();
    },

    setToneGain: (db) => {
      const clamped = Math.min(TONE_MAX_DB, Math.max(TONE_MIN_DB, db));
      set({ toneGainDb: clamped });
      pushToneParams();
    },

    startEngine: async () => {
      set({ busy: true, error: null });
      try {
        const { selectedDeviceId, bufferSize, sampleRate, channels, toneFreqHz, toneGainDb } =
          get();

        const status = await ipc.startAudioEngine({
          deviceName: selectedDeviceId || null,
          bufferSize,
          sampleRate,
          channels,
          toneFreqHz,
          toneGainDb,
        });

        set({ status, busy: false });
      } catch (error) {
        set({ busy: false, error: errorMessage(error) });
      }
    },

    stopEngine: async () => {
      set({ busy: true, error: null });
      try {
        const status = await ipc.stopAudioEngine();
        set({ status, busy: false });
      } catch (error) {
        set({ busy: false, error: errorMessage(error) });
      }
    },

    setToneEnabled: async (enabled) => {
      set({ error: null });
      try {
        const { toneFreqHz, toneGainDb } = get();
        const status = await ipc.setTestTone({
          enabled,
          freqHz: toneFreqHz,
          gainDb: toneGainDb,
        });
        set({ status });
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    refreshStatus: async () => {
      if (!get().status?.initialized) {
        return;
      }
      try {
        const status = await ipc.getEngineStatus();
        set({ status });
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    clearError: () => set({ error: null }),
  };
});
