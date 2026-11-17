import { create } from "zustand";
import { api, errorMessage } from "../lib/ipc";
import type {
  BroadcastConfig,
  BroadcastStatus,
  RecordFormat,
  RecorderStatus,
} from "../lib/ipc";

interface RecordStoreState {
  // Recorder State
  recorder: RecorderStatus;
  selectedFormat: RecordFormat;
  customOutputPath: string;
  isRecordingBusy: boolean;
  recorderError: string | null;

  // Broadcast State
  broadcast: BroadcastStatus;
  broadcastConfig: BroadcastConfig;
  isBroadcastBusy: boolean;
  broadcastError: string | null;

  // Actions
  setFormat: (format: RecordFormat) => void;
  setCustomOutputPath: (path: string) => void;
  updateBroadcastConfig: (patch: Partial<BroadcastConfig>) => void;

  startRecording: (path?: string, format?: RecordFormat) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  splitRecording: () => Promise<void>;

  startBroadcast: () => Promise<void>;
  stopBroadcast: () => Promise<void>;

  pollStatus: () => Promise<void>;
}

const defaultRecorderStatus: RecorderStatus = {
  isRecording: false,
  isPaused: false,
  filePath: null,
  format: "wav-16",
  durationSecs: 0,
  bytesWritten: 0,
  framesRecorded: 0,
  peakL: 0,
  peakR: 0,
  splitCount: 0,
};

const defaultBroadcastStatus: BroadcastStatus = {
  isStreaming: false,
  serverUrl: null,
  mount: null,
  durationSecs: 0,
  bytesSent: 0,
  lastError: null,
};

const defaultBroadcastConfig: BroadcastConfig = {
  server: "127.0.0.1:8000",
  mount: "/live",
  password: "hackme",
  protocol: "icecast2",
  stationName: "DJDeX Radio Live",
  genre: "Electronic / Club Mix",
  description: "Live DJ Mix Powered by DJDeX Workstation",
  bitrateKbps: 320,
  isPublic: false,
};

export const useRecordStore = create<RecordStoreState>((set, get) => ({
  recorder: defaultRecorderStatus,
  selectedFormat: "wav-16",
  customOutputPath: "",
  isRecordingBusy: false,
  recorderError: null,

  broadcast: defaultBroadcastStatus,
  broadcastConfig: defaultBroadcastConfig,
  isBroadcastBusy: false,
  broadcastError: null,

  setFormat: (format) => set({ selectedFormat: format }),
  setCustomOutputPath: (path) => set({ customOutputPath: path }),
  updateBroadcastConfig: (patch) =>
    set((state) => ({
      broadcastConfig: { ...state.broadcastConfig, ...patch },
    })),

  startRecording: async (path, format) => {
    set({ isRecordingBusy: true, recorderError: null });
    try {
      const targetPath = path || get().customOutputPath || undefined;
      const targetFormat = format || get().selectedFormat;
      const status = await api.startRecording(targetPath, targetFormat);
      set({ recorder: status, isRecordingBusy: false });
    } catch (err) {
      set({ recorderError: errorMessage(err), isRecordingBusy: false });
    }
  },

  stopRecording: async () => {
    set({ isRecordingBusy: true, recorderError: null });
    try {
      const status = await api.stopRecording();
      set({ recorder: status, isRecordingBusy: false });
    } catch (err) {
      set({ recorderError: errorMessage(err), isRecordingBusy: false });
    }
  },

  pauseRecording: async () => {
    try {
      const status = await api.pauseRecording();
      set({ recorder: status });
    } catch (err) {
      set({ recorderError: errorMessage(err) });
    }
  },

  resumeRecording: async () => {
    try {
      const status = await api.resumeRecording();
      set({ recorder: status });
    } catch (err) {
      set({ recorderError: errorMessage(err) });
    }
  },

  splitRecording: async () => {
    try {
      const status = await api.splitRecording();
      set({ recorder: status });
    } catch (err) {
      set({ recorderError: errorMessage(err) });
    }
  },

  startBroadcast: async () => {
    set({ isBroadcastBusy: true, broadcastError: null });
    try {
      const config = get().broadcastConfig;
      const status = await api.startBroadcast(config);
      set({ broadcast: status, isBroadcastBusy: false });
    } catch (err) {
      set({ broadcastError: errorMessage(err), isBroadcastBusy: false });
    }
  },

  stopBroadcast: async () => {
    set({ isBroadcastBusy: true, broadcastError: null });
    try {
      const status = await api.stopBroadcast();
      set({ broadcast: status, isBroadcastBusy: false });
    } catch (err) {
      set({ broadcastError: errorMessage(err), isBroadcastBusy: false });
    }
  },

  pollStatus: async () => {
    try {
      const [recStatus, bcStatus] = await Promise.all([
        api.getRecorderStatus().catch(() => get().recorder),
        api.getBroadcastStatus().catch(() => get().broadcast),
      ]);
      set({ recorder: recStatus, broadcast: bcStatus });
    } catch {
      // Ignore polling errors
    }
  },
}));

/** Format detik ke string HH:MM:SS */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const hh = hrs > 0 ? `${hrs.toString().padStart(2, "0")}:` : "";
  const mm = mins.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  return `${hh}${mm}:${ss}`;
}

/** Format ukuran byte ke format MB/KB yang mudah dibaca */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
