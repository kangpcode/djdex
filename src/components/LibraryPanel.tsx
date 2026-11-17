import { useEffect, useState } from "react";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { useLibraryStore } from "../stores/libraryStore";
import type { LibraryTrack } from "../lib/ipc";
import {
  IconClose,
  IconClock,
  IconExport,
  IconFlash,
  IconFolder,
  IconGear,
  IconHeadphones,
  IconImport,
  IconMusic,
  IconPlaylist,
  IconStar,
  IconStop,
  IconSearch,
} from "./ui/Icons";
import { Panel } from "./ui/Panel";

export function LibraryPanel() {
  const tracks = useLibraryStore((s) => s.tracks);
  const crates = useLibraryStore((s) => s.crates);
  const playlists = useLibraryStore((s) => s.playlists);
  const history = useLibraryStore((s) => s.history);
  const viewMode = useLibraryStore((s) => s.viewMode);
  const selectedCrateId = useLibraryStore((s) => s.selectedCrateId);
  const selectedPlaylistId = useLibraryStore((s) => s.selectedPlaylistId);
  const selectedTrackId = useLibraryStore((s) => s.selectedTrackId);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const sortColumn = useLibraryStore((s) => s.sortColumn);
  const sortDescending = useLibraryStore((s) => s.sortDescending);
  const scanProgress = useLibraryStore((s) => s.scanProgress);
  const previewStatus = useLibraryStore((s) => s.previewStatus);
  const isLoading = useLibraryStore((s) => s.isLoading);

  const refreshTracks = useLibraryStore((s) => s.refreshTracks);
  const refreshCrates = useLibraryStore((s) => s.refreshCrates);
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists);
  const refreshHistory = useLibraryStore((s) => s.refreshHistory);
  const scanFolder = useLibraryStore((s) => s.scanFolder);
  const batchAnalyze = useLibraryStore((s) => s.batchAnalyze);
  const createCrate = useLibraryStore((s) => s.createCrate);
  const deleteCrate = useLibraryStore((s) => s.deleteCrate);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const addTrackToCrate = useLibraryStore((s) => s.addTrackToCrate);
  const addTrackToPlaylist = useLibraryStore((s) => s.addTrackToPlaylist);
  const importPlaylist = useLibraryStore((s) => s.importPlaylist);
  const exportPlaylist = useLibraryStore((s) => s.exportPlaylist);
  const updateRating = useLibraryStore((s) => s.updateRating);
  const deleteTrack = useLibraryStore((s) => s.deleteTrack);
  const previewPlay = useLibraryStore((s) => s.previewPlay);
  const previewStop = useLibraryStore((s) => s.previewStop);
  const previewSeek = useLibraryStore((s) => s.previewSeek);
  const setSearch = useLibraryStore((s) => s.setSearch);
  const setSort = useLibraryStore((s) => s.setSort);
  const selectCrate = useLibraryStore((s) => s.selectCrate);
  const selectPlaylist = useLibraryStore((s) => s.selectPlaylist);
  const setViewMode = useLibraryStore((s) => s.setViewMode);
  const selectTrack = useLibraryStore((s) => s.selectTrack);

  const [newCrateName, setNewCrateName] = useState("");
  const [showNewCrateInput, setShowNewCrateInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [isSmartPl, setIsSmartPl] = useState(false);
  const [minBpmInput, setMinBpmInput] = useState<string>("120");
  const [maxBpmInput, setMaxBpmInput] = useState<string>("130");

  useEffect(() => {
    void refreshTracks();
    void refreshCrates();
    void refreshPlaylists();
    void refreshHistory();
  }, [refreshTracks, refreshCrates, refreshPlaylists, refreshHistory]);

  const handleScanFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Pilih Folder Musik untuk Dipindai",
      });
      if (typeof selected === "string") {
        await scanFolder(selected);
      }
    } catch {
      // In browser or fallback, prompt user
      const path = window.prompt("Masukkan path folder musik lokal:", "/home/music");
      if (path) {
        await scanFolder(path);
      }
    }
  };

  const handleImportPlaylist = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: false,
        multiple: false,
        title: "Pilih file Playlist M3U / PLS",
        filters: [{ name: "Playlists", extensions: ["m3u", "m3u8", "pls"] }],
      });
      if (typeof selected === "string") {
        await importPlaylist(selected);
      }
    } catch {
      const path = window.prompt("Masukkan path file playlist:", "/path/to/playlist.m3u8");
      if (path) {
        await importPlaylist(path);
      }
    }
  };

  const handleExportPlaylist = async (id: number, name: string) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        title: `Ekspor Playlist ${name}`,
        defaultPath: `${name}.m3u8`,
        filters: [{ name: "M3U8 Playlist", extensions: ["m3u8"] }],
      });
      if (typeof dest === "string") {
        await exportPlaylist(id, dest);
      }
    } catch {
      const dest = window.prompt("Path tujuan ekspor:", `/tmp/${name}.m3u8`);
      if (dest) {
        await exportPlaylist(id, dest);
      }
    }
  };

  const handleCreateCrate = async () => {
    if (!newCrateName.trim()) return;
    const colors = ["#ff007f", "#00e5ff", "#ffd600", "#00e676", "#7c4dff"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    await createCrate(newCrateName.trim(), randomColor);
    setNewCrateName("");
    setShowNewCrateInput(false);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const smartFilter = isSmartPl
      ? {
          minBpm: parseFloat(minBpmInput) || null,
          maxBpm: parseFloat(maxBpmInput) || null,
        }
      : undefined;

    await createPlaylist(newPlaylistName.trim(), smartFilter);
    setNewPlaylistName("");
    setShowNewPlaylistInput(false);
    setIsSmartPl(false);
  };

  const handleLoadDeck = (slot: 0 | 1, track: LibraryTrack) => {
    if (slot === 0) {
      void useDeckAStore.getState().load(track.filePath);
    } else {
      void useDeckBStore.getState().load(track.filePath);
    }
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const currentPreviewTrack = tracks.find((t) => t.filePath === previewStatus.currentPath);

  return (
    <Panel
      title="Perpustakaan Musik & Playlist"
      subtitle="SQLite database, crate categorizer, smart playlist, batch analyzer & headphone cue preview"
    >
      <div className="flex flex-col h-[520px] bg-slate-950 text-slate-200 rounded-lg overflow-hidden border border-slate-800">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <IconSearch className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Cari lagu, artis, album, genre..."
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-950 text-sm rounded border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
              >
                <IconClose className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleScanFolder}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-cyan-400 rounded border border-cyan-800/60 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Pindai folder musik di komputer"
            >
              <IconFolder className="w-3.5 h-3.5" /> Pindai Folder
            </button>
            <button
              onClick={() => batchAnalyze()}
              disabled={scanProgress.isAnalyzing}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-amber-400 rounded border border-amber-800/60 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="Analisis otomatis BPM, Key Camelot, dan LUFS loudness"
            >
              <IconFlash className="w-3.5 h-3.5" /> {scanProgress.isAnalyzing ? "Menganalisis..." : "Analisis Batch"}
            </button>
            <button
              onClick={handleImportPlaylist}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-purple-400 rounded border border-purple-800/60 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Impor file playlist M3U atau PLS"
            >
              <IconImport className="w-3.5 h-3.5" /> Impor M3U
            </button>
          </div>
        </div>

        {/* Scan & Batch Progress Notification */}
        {(scanProgress.isScanning || scanProgress.isAnalyzing) && (
          <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-purple-950 px-4 py-1.5 border-b border-cyan-800/50 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-cyan-300 font-medium">
              <span className="animate-spin inline-block">
                <IconGear className="w-3.5 h-3.5" />
              </span>
              {scanProgress.isScanning
                ? `Memindai folder... (${scanProgress.scannedFiles} file ditemukan)`
                : `Analisis batch BPM & Key... (${scanProgress.analyzedTracks} / ${scanProgress.totalAnalyze})`}
            </div>
            <div className="w-48 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    scanProgress.isScanning
                      ? 100
                      : scanProgress.totalAnalyze > 0
                      ? Math.min(100, (scanProgress.analyzedTracks / scanProgress.totalAnalyze) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Body Split View */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar Tree: Crates & Playlists */}
          <div className="w-60 bg-slate-900/80 border-r border-slate-800 flex flex-col p-2 space-y-4 overflow-y-auto select-none">
            {/* Library Section */}
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 mb-1">
                Koleksi Utama
              </div>
              <button
                onClick={() => setViewMode("all")}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                  viewMode === "all"
                    ? "bg-cyan-600 text-white font-semibold"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <IconMusic className="w-3.5 h-3.5" /> Semua Track
                </div>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
                  {tracks.length}
                </span>
              </button>
              <button
                onClick={() => setViewMode("history")}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                  viewMode === "history"
                    ? "bg-cyan-600 text-white font-semibold"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <IconClock className="w-3.5 h-3.5" /> Riwayat Putar
                </div>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
                  {history.length}
                </span>
              </button>
            </div>

            {/* Crates Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Crates (Kategori)
                </span>
                <button
                  onClick={() => setShowNewCrateInput(!showNewCrateInput)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold px-1"
                  title="Tambah Crate baru"
                >
                  +
                </button>
              </div>

              {showNewCrateInput && (
                <div className="px-2 py-1 flex items-center gap-1 mb-1 bg-slate-950 rounded border border-slate-800">
                  <input
                    type="text"
                    placeholder="Nama crate..."
                    value={newCrateName}
                    onChange={(e) => setNewCrateName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateCrate()}
                    className="w-full text-xs bg-transparent text-slate-100 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateCrate}
                    className="text-[10px] px-1.5 py-0.5 bg-cyan-600 text-white rounded font-medium"
                  >
                    OK
                  </button>
                </div>
              )}

              <div className="space-y-0.5">
                {crates.map((crate) => (
                  <div
                    key={crate.id}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                      viewMode === "crate" && selectedCrateId === crate.id
                        ? "bg-slate-800 text-cyan-300 font-semibold border-l-2 border-cyan-400"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                    onClick={() => selectCrate(crate.id)}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: crate.color || "#00e5ff" }}
                      />
                      <span className="truncate">{crate.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 group-hover:hidden">
                        {crate.trackCount}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteCrate(crate.id);
                        }}
                        className="hidden group-hover:inline-block text-slate-500 hover:text-rose-400 text-xs px-1"
                        title="Hapus Crate"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Playlists Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Playlists
                </span>
                <button
                  onClick={() => setShowNewPlaylistInput(!showNewPlaylistInput)}
                  className="text-xs text-purple-400 hover:text-purple-300 font-bold px-1"
                  title="Tambah Playlist baru"
                >
                  +
                </button>
              </div>

              {showNewPlaylistInput && (
                <div className="p-2 mb-1 bg-slate-950 rounded border border-slate-800 space-y-1.5 text-xs">
                  <input
                    type="text"
                    placeholder="Nama playlist..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-100"
                    autoFocus
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={isSmartPl}
                      onChange={(e) => setIsSmartPl(e.target.checked)}
                      className="rounded bg-slate-900"
                    />
                    Smart Playlist (BPM filter)
                  </label>
                  {isSmartPl && (
                    <div className="flex items-center gap-1 text-[11px]">
                      <span>BPM:</span>
                      <input
                        type="number"
                        value={minBpmInput}
                        onChange={(e) => setMinBpmInput(e.target.value)}
                        className="w-12 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-center"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        value={maxBpmInput}
                        onChange={(e) => setMaxBpmInput(e.target.value)}
                        className="w-12 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-center"
                      />
                    </div>
                  )}
                  <div className="flex justify-end gap-1 pt-1">
                    <button
                      onClick={() => setShowNewPlaylistInput(false)}
                      className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleCreatePlaylist}
                      className="px-2 py-0.5 text-[10px] bg-purple-600 text-white rounded font-medium"
                    >
                      Buat
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-0.5">
                {playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                      viewMode === "playlist" && selectedPlaylistId === pl.id
                        ? "bg-slate-800 text-purple-300 font-semibold border-l-2 border-purple-400"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                    onClick={() => selectPlaylist(pl.id)}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {pl.isSmart ? (
                        <IconFlash className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <IconPlaylist className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="truncate">{pl.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleExportPlaylist(pl.id, pl.name);
                        }}
                        className="hidden group-hover:inline-block text-slate-400 hover:text-cyan-300 p-1"
                        title="Ekspor ke format M3U8"
                      >
                        <IconExport className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void deletePlaylist(pl.id);
                        }}
                        className="hidden group-hover:inline-block text-slate-500 hover:text-rose-400 p-1"
                        title="Hapus Playlist"
                      >
                        <IconClose className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] text-slate-500 group-hover:hidden">
                        {pl.trackCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Track Table */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {/* View Breadcrumb / Title Bar */}
            <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">
                  {viewMode === "all" && "Semua Track Perpustakaan"}
                  {viewMode === "history" && "Riwayat Pemutaran DJ"}
                  {viewMode === "crate" &&
                    `Crate: ${crates.find((c) => c.id === selectedCrateId)?.name || ""}`}
                  {viewMode === "playlist" &&
                    `Playlist: ${playlists.find((p) => p.id === selectedPlaylistId)?.name || ""}`}
                </span>
                <span className="text-[11px] text-slate-500">
                  ({viewMode === "history" ? history.length : tracks.length} item)
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Double click track untuk memuat • Drag & Drop ke Deck
              </div>
            </div>

            {/* Table Header & Rows */}
            <div className="flex-1 overflow-auto">
              {viewMode === "history" ? (
                /* History Table */
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3">Deck</th>
                      <th className="py-2 px-3">Judul Lagu</th>
                      <th className="py-2 px-3">Artis</th>
                      <th className="py-2 px-3">Durasi</th>
                      <th className="py-2 px-3">Waktu Putar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.deckSlot === 0
                                ? "bg-cyan-950 text-cyan-400 border border-cyan-800"
                                : "bg-pink-950 text-pink-400 border border-pink-800"
                            }`}
                          >
                            Deck {item.deckSlot === 0 ? "A" : "B"}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-100">{item.title}</td>
                        <td className="py-2 px-3 text-slate-400">{item.artist}</td>
                        <td className="py-2 px-3 text-slate-400">
                          {formatDuration(item.durationSecs)}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {new Date(parseInt(item.playedAt) * 1000).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Belum ada riwayat lagu yang dimainkan pada sesi ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                /* Tracks Table */
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0 z-10 select-none">
                    <tr>
                      <th className="py-2 px-2.5 w-10 text-center">Cue</th>
                      <th className="py-2 px-2.5 w-24 text-center">Load</th>
                      <th
                        className="py-2 px-3 cursor-pointer hover:text-slate-200"
                        onClick={() => setSort("title")}
                      >
                        Judul {sortColumn === "title" && (sortDescending ? "▼" : "▲")}
                      </th>
                      <th
                        className="py-2 px-3 cursor-pointer hover:text-slate-200"
                        onClick={() => setSort("artist")}
                      >
                        Artis {sortColumn === "artist" && (sortDescending ? "▼" : "▲")}
                      </th>
                      <th
                        className="py-2 px-3 w-16 cursor-pointer hover:text-slate-200 text-center"
                        onClick={() => setSort("bpm")}
                      >
                        BPM {sortColumn === "bpm" && (sortDescending ? "▼" : "▲")}
                      </th>
                      <th
                        className="py-2 px-3 w-16 cursor-pointer hover:text-slate-200 text-center"
                        onClick={() => setSort("keyName")}
                      >
                        Key {sortColumn === "keyName" && (sortDescending ? "▼" : "▲")}
                      </th>
                      <th
                        className="py-2 px-3 w-16 cursor-pointer hover:text-slate-200"
                        onClick={() => setSort("durationSecs")}
                      >
                        Waktu {sortColumn === "durationSecs" && (sortDescending ? "▼" : "▲")}
                      </th>
                      <th
                        className="py-2 px-3 w-24 cursor-pointer hover:text-slate-200"
                        onClick={() => setSort("rating")}
                      >
                        Rating {sortColumn === "rating" && (sortDescending ? "▼" : "▲")}
                      </th>
                      <th className="py-2 px-3 w-28">Genre</th>
                      <th
                        className="py-2 px-2.5 w-12 text-center cursor-pointer hover:text-slate-200"
                        onClick={() => setSort("playCount")}
                        title="Jumlah Diputar"
                      >
                        Plays
                      </th>
                      <th className="py-2 px-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {tracks.map((track) => {
                      const isPreviewingThis =
                        previewStatus.isPlaying && previewStatus.currentPath === track.filePath;
                      const isSelected = selectedTrackId === track.id;

                      return (
                        <tr
                          key={track.id}
                          onClick={() => selectTrack(track.id)}
                          onDoubleClick={() => handleLoadDeck(0, track)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", track.filePath);
                          }}
                          className={`group transition-colors ${
                            isSelected
                              ? "bg-slate-800/80"
                              : "hover:bg-slate-900/60"
                          } ${isPreviewingThis ? "border-l-2 border-emerald-400" : ""}`}
                        >
                          {/* Cue Preview Button */}
                          <td className="py-1.5 px-2.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isPreviewingThis) {
                                  void previewStop();
                                } else {
                                  void previewPlay(track.filePath, 0);
                                }
                              }}
                              className={`p-1 rounded text-xs transition-colors ${
                                isPreviewingThis
                                  ? "bg-emerald-500 text-slate-950 font-bold animate-pulse"
                                  : "text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                              }`}
                              title={
                                isPreviewingThis
                                  ? "Hentikan headphone cue preview"
                                  : "Dengarkan cuplikan headphone cue (PFL)"
                              }
                            >
                              <IconHeadphones className="w-3.5 h-3.5 inline-block" />
                            </button>
                          </td>

                          {/* Load to Deck A / B */}
                          <td className="py-1.5 px-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadDeck(0, track);
                                }}
                                className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-950 hover:bg-cyan-900 text-cyan-400 border border-cyan-800/60 rounded"
                                title="Muat ke Deck A"
                              >
                                A
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadDeck(1, track);
                                }}
                                className="px-1.5 py-0.5 text-[10px] font-bold bg-pink-950 hover:bg-pink-900 text-pink-400 border border-pink-800/60 rounded"
                                title="Muat ke Deck B"
                              >
                                B
                              </button>
                            </div>
                          </td>

                          {/* Title & Artist */}
                          <td className="py-1.5 px-3">
                            <div className="font-medium text-slate-100 truncate max-w-[200px]">
                              {track.title}
                            </div>
                            {track.album && (
                              <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                                {track.album}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-slate-300 truncate max-w-[150px]">
                            {track.artist}
                          </td>

                          {/* BPM */}
                          <td className="py-1.5 px-3 text-center font-mono font-medium text-cyan-300">
                            {track.bpm ? track.bpm.toFixed(1) : "--"}
                          </td>

                          {/* Key (Camelot Badge) */}
                          <td className="py-1.5 px-3 text-center">
                            {track.keyName ? (
                              <span className="px-1.5 py-0.5 bg-slate-800 border border-purple-800/60 rounded text-[10px] font-mono font-bold text-purple-300">
                                {track.keyName}
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono">--</span>
                            )}
                          </td>

                          {/* Duration */}
                          <td className="py-1.5 px-3 font-mono text-slate-400">
                            {formatDuration(track.durationSecs)}
                          </td>

                          {/* Rating Stars */}
                          <td className="py-1.5 px-3">
                            <div className="flex items-center gap-0.5 text-amber-400 text-xs">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void updateRating(track.id, star === track.rating ? 0 : star);
                                  }}
                                  className="hover:scale-125 transition-transform"
                                >
                                  {star <= track.rating ? "★" : "☆"}
                                </button>
                              ))}
                            </div>
                          </td>

                          {/* Genre */}
                          <td className="py-1.5 px-3 text-slate-400 truncate max-w-[120px]">
                            {track.genre || "--"}
                          </td>

                          {/* Play Count */}
                          <td className="py-1.5 px-2.5 text-center font-mono text-slate-500 text-[11px]">
                            {track.playCount}
                          </td>

                          {/* Delete & Add Actions */}
                          <td className="py-1.5 px-2 text-center">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {crates.length > 0 && (
                                <select
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const cId = parseInt(e.target.value);
                                    if (cId) {
                                      void addTrackToCrate(cId, track.id);
                                      e.target.value = "";
                                    }
                                  }}
                                  defaultValue=""
                                  className="text-[9px] bg-slate-900 text-slate-300 border border-slate-700 rounded px-1 py-0.5"
                                  title="Tambahkan ke Crate"
                                >
                                  <option value="" disabled>
                                    + Crate
                                  </option>
                                  {crates.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {playlists.filter((p) => !p.isSmart).length > 0 && (
                                <select
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const pId = parseInt(e.target.value);
                                    if (pId) {
                                      void addTrackToPlaylist(pId, track.id);
                                      e.target.value = "";
                                    }
                                  }}
                                  defaultValue=""
                                  className="text-[9px] bg-slate-900 text-slate-300 border border-slate-700 rounded px-1 py-0.5"
                                  title="Tambahkan ke Playlist"
                                >
                                  <option value="" disabled>
                                    + List
                                  </option>
                                  {playlists
                                    .filter((p) => !p.isSmart)
                                    .map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                </select>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteTrack(track.id);
                                }}
                                className="text-slate-600 hover:text-rose-400 p-0.5 text-xs"
                                title="Hapus dari Library"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {tracks.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-500">
                          <div className="space-y-2">
                            <div>Belum ada track musik di folder ini.</div>
                            <button
                              onClick={handleScanFolder}
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
                            >
                              Pindai Folder Musik Lokal
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Headphone Cue Preview Player Bottom Bar */}
        {previewStatus.isPlaying && (
          <div className="bg-slate-900 border-t border-emerald-500/40 px-4 py-2 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
              <div className="truncate max-w-sm">
                <span className="text-emerald-400 font-bold mr-2">HEADPHONE CUE:</span>
                <span className="font-semibold text-slate-100">
                  {currentPreviewTrack?.title || "Previewing Audio"}
                </span>
                <span className="text-slate-400 ml-1">
                  — {currentPreviewTrack?.artist || "Cue Bus Only"}
                </span>
              </div>
            </div>

            {/* Scrub Slider */}
            <div className="flex-1 flex items-center gap-2 max-w-md">
              <span className="font-mono text-[10px] text-slate-400">
                {formatDuration(previewStatus.positionSecs)}
              </span>
              <input
                type="range"
                min={0}
                max={previewStatus.durationSecs || 100}
                step={0.5}
                value={previewStatus.positionSecs}
                onChange={(e) => previewSeek(parseFloat(e.target.value))}
                className="w-full accent-emerald-400 h-1 bg-slate-800 rounded cursor-pointer"
              />
              <span className="font-mono text-[10px] text-slate-400">
                {formatDuration(previewStatus.durationSecs)}
              </span>
            </div>

            {/* Stop Preview Button */}
            <button
              onClick={() => previewStop()}
              className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 rounded font-semibold text-xs flex items-center gap-1"
            >
              <span>⏹</span> Stop Cue
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
