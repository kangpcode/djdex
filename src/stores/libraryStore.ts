import { create } from "zustand";

import {
  api,
  isTauri,
  type CrateItem,
  type HistoryItem,
  type LibraryTrack,
  type PlaylistItem,
  type PreviewStatus,
  type ScanProgress,
  type SmartFilter,
  type TrackQuery,
} from "../lib/ipc";

export type ViewMode = "all" | "crate" | "playlist" | "history";

interface LibraryState {
  tracks: LibraryTrack[];
  crates: CrateItem[];
  playlists: PlaylistItem[];
  history: HistoryItem[];
  scanProgress: ScanProgress;
  previewStatus: PreviewStatus;
  selectedCrateId: number | null;
  selectedPlaylistId: number | null;
  selectedTrackId: number | null;
  viewMode: ViewMode;
  searchQuery: string;
  sortColumn: string;
  sortDescending: boolean;
  isLoading: boolean;
  error: string | null;

  refreshTracks: () => Promise<void>;
  refreshCrates: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshProgress: () => Promise<void>;
  refreshPreview: () => Promise<void>;
  scanFolder: (path: string) => Promise<void>;
  batchAnalyze: (trackIds?: number[]) => Promise<void>;
  createCrate: (name: string, color?: string) => Promise<void>;
  deleteCrate: (id: number) => Promise<void>;
  addTrackToCrate: (crateId: number, trackId: number) => Promise<void>;
  removeTrackFromCrate: (crateId: number, trackId: number) => Promise<void>;
  createPlaylist: (name: string, smartFilter?: SmartFilter) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  addTrackToPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  importPlaylist: (filePath: string) => Promise<void>;
  exportPlaylist: (playlistId: number, destPath: string) => Promise<void>;
  updateRating: (trackId: number, rating: number) => Promise<void>;
  updateColor: (trackId: number, color?: string) => Promise<void>;
  deleteTrack: (trackId: number) => Promise<void>;
  previewPlay: (path: string, startSecs?: number) => Promise<void>;
  previewStop: () => Promise<void>;
  previewSeek: (seconds: number) => Promise<void>;
  setSearch: (search: string) => void;
  setSort: (column: string) => void;
  selectCrate: (id: number | null) => void;
  selectPlaylist: (id: number | null) => void;
  setViewMode: (mode: ViewMode) => void;
  selectTrack: (id: number | null) => void;
}

const mockTracks: LibraryTrack[] = [
  {
    id: 1,
    filePath: "/demo/Oliver Heldens - Gecko.mp3",
    title: "Gecko (Overdrive)",
    artist: "Oliver Heldens",
    album: "Future House Anthem",
    genre: "Future House",
    year: 2024,
    bpm: 125.0,
    keyName: "8A",
    durationSecs: 215.0,
    rating: 5,
    color: "#00e5ff",
    playCount: 14,
    dateAdded: "1700000000",
    analyzed: true,
    loudnessLufs: -7.8,
  },
  {
    id: 2,
    filePath: "/demo/Fisher - Losing It.mp3",
    title: "Losing It",
    artist: "FISHER",
    album: "Catch & Release",
    genre: "Tech House",
    year: 2023,
    bpm: 125.0,
    keyName: "4A",
    durationSecs: 248.0,
    rating: 5,
    color: "#ff007f",
    playCount: 22,
    dateAdded: "1700000100",
    analyzed: true,
    loudnessLufs: -6.5,
  },
  {
    id: 3,
    filePath: "/demo/Fred Again - Jungle.mp3",
    title: "Jungle",
    artist: "Fred again..",
    album: "USB",
    genre: "Drum & Bass",
    year: 2024,
    bpm: 134.0,
    keyName: "11B",
    durationSecs: 198.0,
    rating: 4,
    color: "#00e676",
    playCount: 9,
    dateAdded: "1700000200",
    analyzed: true,
    loudnessLufs: -7.2,
  },
  {
    id: 4,
    filePath: "/demo/Peggy Gou - Nanana.mp3",
    title: "(It Goes Like) Nanana",
    artist: "Peggy Gou",
    album: "I Hear You",
    genre: "Dance / Club",
    year: 2023,
    bpm: 130.0,
    keyName: "8B",
    durationSecs: 231.0,
    rating: 4,
    color: "#ffd600",
    playCount: 18,
    dateAdded: "1700000300",
    analyzed: true,
    loudnessLufs: -8.1,
  },
];

const mockCrates: CrateItem[] = [
  { id: 1, name: "Peak Hour Bangers", color: "#ff007f", trackCount: 3 },
  { id: 2, name: "Sunset Vibes", color: "#ffd600", trackCount: 2 },
  { id: 3, name: "Warmup Grooves", color: "#00e5ff", trackCount: 1 },
];

const mockPlaylists: PlaylistItem[] = [
  { id: 1, name: "Friday Night Set", isSmart: false, smartFilter: null, trackCount: 4 },
  {
    id: 2,
    name: "House 124-128 BPM",
    isSmart: true,
    smartFilter: { minBpm: 124, maxBpm: 128 },
    trackCount: 2,
  },
];

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: mockTracks,
  crates: mockCrates,
  playlists: mockPlaylists,
  history: [],
  scanProgress: {
    isScanning: false,
    isAnalyzing: false,
    scannedFiles: 0,
    totalFiles: 0,
    analyzedTracks: 0,
    totalAnalyze: 0,
  },
  previewStatus: {
    isPlaying: false,
    currentPath: null,
    positionSecs: 0,
    durationSecs: 0,
  },
  selectedCrateId: null,
  selectedPlaylistId: null,
  selectedTrackId: 1,
  viewMode: "all",
  searchQuery: "",
  sortColumn: "title",
  sortDescending: false,
  isLoading: false,
  error: null,

  refreshTracks: async () => {
    if (!isTauri()) {
      return;
    }
    const { searchQuery, sortColumn, sortDescending, selectedCrateId, selectedPlaylistId, viewMode } = get();
    set({ isLoading: true });
    try {
      const query: TrackQuery = {
        search: searchQuery || undefined,
        sortColumn,
        sortDescending,
        crateId: viewMode === "crate" ? (selectedCrateId ?? undefined) : undefined,
        playlistId: viewMode === "playlist" ? (selectedPlaylistId ?? undefined) : undefined,
      };
      const tracks = await api.getLibraryTracks(query);
      set({ tracks, isLoading: false, error: null });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  refreshCrates: async () => {
    if (!isTauri()) return;
    try {
      const crates = await api.listCrates();
      set({ crates });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshPlaylists: async () => {
    if (!isTauri()) return;
    try {
      const playlists = await api.listPlaylists();
      set({ playlists });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshHistory: async () => {
    if (!isTauri()) return;
    try {
      const history = await api.getLibraryHistory(100);
      set({ history });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshProgress: async () => {
    if (!isTauri()) return;
    try {
      const scanProgress = await api.getScanProgress();
      set({ scanProgress });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshPreview: async () => {
    if (!isTauri()) return;
    try {
      const previewStatus = await api.getPreviewStatus();
      set({ previewStatus });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  scanFolder: async (path: string) => {
    if (!isTauri()) return;
    try {
      const scanProgress = await api.scanLibraryFolder(path);
      set({ scanProgress });
      await get().refreshTracks();
      await get().refreshCrates();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  batchAnalyze: async (trackIds?: number[]) => {
    if (!isTauri()) return;
    try {
      const scanProgress = await api.startBatchAnalyze(trackIds);
      set({ scanProgress });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  createCrate: async (name: string, color?: string) => {
    if (!isTauri()) {
      const newCrate: CrateItem = { id: Date.now(), name, color: color ?? null, trackCount: 0 };
      set((s) => ({ crates: [...s.crates, newCrate] }));
      return;
    }
    try {
      await api.createCrate(name, color);
      await get().refreshCrates();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteCrate: async (id: number) => {
    if (!isTauri()) {
      set((s) => ({ crates: s.crates.filter((c) => c.id !== id) }));
      return;
    }
    try {
      await api.deleteCrate(id);
      await get().refreshCrates();
      if (get().selectedCrateId === id) {
        set({ selectedCrateId: null, viewMode: "all" });
        await get().refreshTracks();
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  addTrackToCrate: async (crateId: number, trackId: number) => {
    if (!isTauri()) return;
    try {
      await api.addTrackToCrate(crateId, trackId);
      await get().refreshCrates();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removeTrackFromCrate: async (crateId: number, trackId: number) => {
    if (!isTauri()) return;
    try {
      await api.removeTrackFromCrate(crateId, trackId);
      await get().refreshCrates();
      if (get().selectedCrateId === crateId) {
        await get().refreshTracks();
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  createPlaylist: async (name: string, smartFilter?: SmartFilter) => {
    if (!isTauri()) {
      const newPl: PlaylistItem = {
        id: Date.now(),
        name,
        isSmart: Boolean(smartFilter),
        smartFilter: smartFilter ?? null,
        trackCount: 0,
      };
      set((s) => ({ playlists: [...s.playlists, newPl] }));
      return;
    }
    try {
      await api.createPlaylist(name, smartFilter);
      await get().refreshPlaylists();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deletePlaylist: async (id: number) => {
    if (!isTauri()) {
      set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
      return;
    }
    try {
      await api.deletePlaylist(id);
      await get().refreshPlaylists();
      if (get().selectedPlaylistId === id) {
        set({ selectedPlaylistId: null, viewMode: "all" });
        await get().refreshTracks();
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  addTrackToPlaylist: async (playlistId: number, trackId: number) => {
    if (!isTauri()) return;
    try {
      await api.addTrackToPlaylist(playlistId, trackId);
      await get().refreshPlaylists();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removeTrackFromPlaylist: async (playlistId: number, trackId: number) => {
    if (!isTauri()) return;
    try {
      await api.removeTrackFromPlaylist(playlistId, trackId);
      await get().refreshPlaylists();
      if (get().selectedPlaylistId === playlistId) {
        await get().refreshTracks();
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  importPlaylist: async (filePath: string) => {
    if (!isTauri()) return;
    try {
      await api.importPlaylist(filePath);
      await get().refreshPlaylists();
      await get().refreshTracks();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  exportPlaylist: async (playlistId: number, destPath: string) => {
    if (!isTauri()) return;
    try {
      await api.exportPlaylist(playlistId, destPath);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateRating: async (trackId: number, rating: number) => {
    if (!isTauri()) {
      set((s) => ({
        tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, rating } : t)),
      }));
      return;
    }
    try {
      await api.updateTrackRating(trackId, rating);
      set((s) => ({
        tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, rating } : t)),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateColor: async (trackId: number, color?: string) => {
    if (!isTauri()) {
      set((s) => ({
        tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, color: color ?? null } : t)),
      }));
      return;
    }
    try {
      await api.updateTrackColor(trackId, color);
      set((s) => ({
        tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, color: color ?? null } : t)),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteTrack: async (trackId: number) => {
    if (!isTauri()) {
      set((s) => ({ tracks: s.tracks.filter((t) => t.id !== trackId) }));
      return;
    }
    try {
      await api.deleteLibraryTrack(trackId);
      await get().refreshTracks();
      await get().refreshCrates();
      await get().refreshPlaylists();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  previewPlay: async (path: string, startSecs?: number) => {
    if (!isTauri()) {
      set({
        previewStatus: {
          isPlaying: true,
          currentPath: path,
          positionSecs: startSecs ?? 0,
          durationSecs: 215,
        },
      });
      return;
    }
    try {
      const status = await api.previewPlay(path, startSecs);
      set({ previewStatus: status });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  previewStop: async () => {
    if (!isTauri()) {
      set({
        previewStatus: {
          isPlaying: false,
          currentPath: null,
          positionSecs: 0,
          durationSecs: 0,
        },
      });
      return;
    }
    try {
      const status = await api.previewStop();
      set({ previewStatus: status });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  previewSeek: async (seconds: number) => {
    if (!isTauri()) return;
    try {
      const status = await api.previewSeek(seconds);
      set({ previewStatus: status });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setSearch: (search: string) => {
    set({ searchQuery: search });
    get().refreshTracks();
  },

  setSort: (column: string) => {
    const { sortColumn, sortDescending } = get();
    if (sortColumn === column) {
      set({ sortDescending: !sortDescending });
    } else {
      set({ sortColumn: column, sortDescending: false });
    }
    get().refreshTracks();
  },

  selectCrate: (id: number | null) => {
    set({
      selectedCrateId: id,
      selectedPlaylistId: null,
      viewMode: id !== null ? "crate" : "all",
    });
    get().refreshTracks();
  },

  selectPlaylist: (id: number | null) => {
    set({
      selectedPlaylistId: id,
      selectedCrateId: null,
      viewMode: id !== null ? "playlist" : "all",
    });
    get().refreshTracks();
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
    if (mode === "history") {
      get().refreshHistory();
    } else {
      get().refreshTracks();
    }
  },

  selectTrack: (id: number | null) => {
    set({ selectedTrackId: id });
  },
}));
