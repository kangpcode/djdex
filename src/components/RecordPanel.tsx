import { useEffect, useState } from "react";
import { formatBytes, formatDuration, useRecordStore } from "../stores/recordStore";
import { Panel } from "./ui/Panel";
import type { BroadcastProtocol, RecordFormat } from "../lib/ipc";

export function RecordPanel() {
  const [activeTab, setActiveTab] = useState<"recorder" | "broadcast">("recorder");
  const [showPassword, setShowPassword] = useState(false);

  // Store state
  const recorder = useRecordStore((s) => s.recorder);
  const selectedFormat = useRecordStore((s) => s.selectedFormat);
  const customOutputPath = useRecordStore((s) => s.customOutputPath);
  const isRecordingBusy = useRecordStore((s) => s.isRecordingBusy);
  const recorderError = useRecordStore((s) => s.recorderError);

  const broadcast = useRecordStore((s) => s.broadcast);
  const broadcastConfig = useRecordStore((s) => s.broadcastConfig);
  const isBroadcastBusy = useRecordStore((s) => s.isBroadcastBusy);
  const broadcastError = useRecordStore((s) => s.broadcastError);

  // Store actions
  const setFormat = useRecordStore((s) => s.setFormat);
  const setCustomOutputPath = useRecordStore((s) => s.setCustomOutputPath);
  const updateBroadcastConfig = useRecordStore((s) => s.updateBroadcastConfig);

  const startRecording = useRecordStore((s) => s.startRecording);
  const stopRecording = useRecordStore((s) => s.stopRecording);
  const pauseRecording = useRecordStore((s) => s.pauseRecording);
  const resumeRecording = useRecordStore((s) => s.resumeRecording);
  const splitRecording = useRecordStore((s) => s.splitRecording);

  const startBroadcast = useRecordStore((s) => s.startBroadcast);
  const stopBroadcast = useRecordStore((s) => s.stopBroadcast);
  const pollStatus = useRecordStore((s) => s.pollStatus);

  // Polling interval untuk update realtime VU meter, duration, dan bytes
  useEffect(() => {
    pollStatus();
    const intervalTime = recorder.isRecording || broadcast.isStreaming ? 100 : 1000;
    const interval = setInterval(() => {
      pollStatus();
    }, intervalTime);

    return () => clearInterval(interval);
  }, [recorder.isRecording, broadcast.isStreaming, pollStatus]);

  // Hitung persentase VU meter (0-100%)
  const peakLPercent = Math.min(100, Math.round(recorder.peakL * 100));
  const peakRPercent = Math.min(100, Math.round(recorder.peakR * 100));

  return (
    <Panel title="Record & Live Broadcast" className="h-full flex flex-col overflow-hidden bg-slate-950/80">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("recorder")}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "recorder"
                ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                recorder.isRecording
                  ? recorder.isPaused
                    ? "bg-amber-400"
                    : "bg-red-500 animate-pulse"
                  : "bg-slate-600"
              }`}
            />
            Master Mix Recorder
          </button>

          <button
            onClick={() => setActiveTab("broadcast")}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "broadcast"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                broadcast.isStreaming ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
              }`}
            />
            Live Streaming Broadcast
          </button>
        </div>

        {/* Global Status Quick Badges */}
        <div className="flex items-center gap-3 text-xs">
          {recorder.isRecording && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-950/70 border border-red-600/40 text-red-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>REC {formatDuration(recorder.durationSecs)}</span>
            </div>
          )}
          {broadcast.isStreaming && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-600/40 text-emerald-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>ON AIR {formatDuration(broadcast.durationSecs)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "recorder" ? (
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Error Message */}
            {recorderError && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center justify-between">
                <span>{recorderError}</span>
              </div>
            )}

            {/* Recorder Master Display Card */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Status Indicator & Timer */}
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                      recorder.isRecording
                        ? recorder.isPaused
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                          : "bg-red-500/20 border-red-500/50 text-red-500 shadow-lg shadow-red-500/20"
                        : "bg-slate-800/60 border-slate-700/60 text-slate-500"
                    }`}
                  >
                    <svg
                      className={`w-7 h-7 ${recorder.isRecording && !recorder.isPaused ? "animate-pulse" : ""}`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <circle cx="12" cy="12" r="8" />
                    </svg>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                        {recorder.isRecording
                          ? recorder.isPaused
                            ? "Rekaman Dijeda (Paused)"
                            : "Merekam Master Mix (Recording)"
                          : "Perekam Siaga (Idle)"}
                      </span>
                      {recorder.isRecording && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-400 border border-slate-700">
                          Part {recorder.splitCount + 1}
                        </span>
                      )}
                    </div>
                    <div className="text-4xl font-mono font-bold tracking-tight text-slate-100">
                      {formatDuration(recorder.durationSecs)}
                    </div>
                  </div>
                </div>

                {/* Metrics Badges */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-semibold">Ukuran File</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {formatBytes(recorder.bytesWritten)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-semibold">Format Audio</div>
                    <div className="text-sm font-mono font-bold text-cyan-400">
                      {recorder.format === "wav-16"
                        ? "WAV 16-bit"
                        : recorder.format === "wav-24"
                        ? "WAV 24-bit"
                        : "WAV 32-bit Fl"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 col-span-2 md:col-span-1">
                    <div className="text-slate-500 text-[10px] uppercase font-semibold">Sampel / Frames</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {recorder.framesRecorded.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

                {/* Real-time VU Meters */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                    <span className="w-3 text-right">L</span>
                    <div className="flex-1 h-2 rounded bg-slate-950 overflow-hidden flex">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                        style={{ width: `${peakLPercent}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-slate-500">{peakLPercent}%</span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                    <span className="w-3 text-right">R</span>
                    <div className="flex-1 h-2 rounded bg-slate-950 overflow-hidden flex">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                        style={{ width: `${peakRPercent}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-slate-500">{peakRPercent}%</span>
                  </div>
                </div>

              {/* Current Output File Location */}
              {recorder.filePath && (
                <div className="mt-3 text-[11px] font-mono text-slate-400 truncate bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/60">
                  <span className="text-slate-500">Menyimpan di: </span>
                  <span className="text-slate-300">{recorder.filePath}</span>
                </div>
              )}
            </div>

            {/* Recorder Primary Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {!recorder.isRecording ? (
                <button
                  onClick={() => startRecording()}
                  disabled={isRecordingBusy}
                  className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  Mulai Rekam Mix (Start REC)
                </button>
              ) : (
                <>
                  <button
                    onClick={() => stopRecording()}
                    disabled={isRecordingBusy}
                    className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-red-500/50 text-red-400 font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Hentikan Rekaman (Stop)
                  </button>

                  {recorder.isPaused ? (
                    <button
                      onClick={() => resumeRecording()}
                      className="px-4 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Lanjutkan (Resume)
                    </button>
                  ) : (
                    <button
                      onClick={() => pauseRecording()}
                      className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Jeda (Pause)
                    </button>
                  )}

                  <button
                    onClick={() => splitRecording()}
                    className="px-4 py-3 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-700/60 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer"
                    title="Mulai file rekaman baru tanpa kehilangan satu sampel audio pun"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 3h5v5" />
                      <path d="M4 20L21 3" />
                      <path d="M21 16v5h-5" />
                      <path d="M15 15l6 6" />
                      <path d="M4 4l5 5" />
                    </svg>
                    Split Track (Potong Bagian)
                  </button>
                </>
              )}
            </div>

            {/* Recorder Settings Card */}
            <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20v-6M6 20V10M18 20V4" />
                </svg>
                Pengaturan Kualitas & File Rekaman
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Format Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Format Audio WAV
                  </label>
                  <select
                    value={selectedFormat}
                    onChange={(e) => setFormat(e.target.value as RecordFormat)}
                    disabled={recorder.isRecording}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="wav-16">WAV 16-bit PCM (Kualitas Standar CD Audio)</option>
                    <option value="wav-24">WAV 24-bit PCM (Kualitas Studio Rekaman Pro)</option>
                    <option value="wav-32-float">WAV 32-bit Float (High Dynamic Range - Anti Clipping)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    * Format audio tidak dapat diubah saat proses rekaman sedang berlangsung.
                  </p>
                </div>

                {/* Output File Path */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Nama / Lokasi File Khusus (Opsional)
                  </label>
                  <input
                    type="text"
                    value={customOutputPath}
                    onChange={(e) => setCustomOutputPath(e.target.value)}
                    disabled={recorder.isRecording}
                    placeholder="Kosongkan untuk otomatis di folder DJDeX Recordings"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Format otomatis: <code className="text-cyan-400">DJDeX_Mix_[timestamp].wav</code>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Live Streaming Broadcast Tab */
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Error Message */}
            {broadcastError && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center justify-between">
                <span>{broadcastError}</span>
              </div>
            )}

            {/* Broadcast Status Card */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                      broadcast.isStreaming
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/20"
                        : "bg-slate-800/60 border-slate-700/60 text-slate-500"
                    }`}
                  >
                    <svg
                      className={`w-7 h-7 ${broadcast.isStreaming ? "animate-pulse" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4.93 4.93a10 10 0 0 1 14.14 0" />
                      <path d="M7.76 7.76a6 6 0 0 1 8.48 0" />
                      <circle cx="12" cy="12" r="2" fill="currentColor" />
                      <path d="M12 14v7" />
                    </svg>
                  </div>

                  <div>
                    <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center gap-2">
                      {broadcast.isStreaming ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          <span className="text-emerald-400">SIARAN LANGSUNG ON AIR</span>
                        </>
                      ) : (
                        <span>Status: Offline</span>
                      )}
                    </div>
                    <div className="text-4xl font-mono font-bold tracking-tight text-slate-100">
                      {formatDuration(broadcast.durationSecs)}
                    </div>
                  </div>
                </div>

                {/* Broadcast Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-semibold">Data Terkirim</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {formatBytes(broadcast.bytesSent)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-semibold">Bitrate Siaran</div>
                    <div className="text-sm font-mono font-bold text-emerald-400">
                      {broadcastConfig.bitrateKbps} kbps
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 col-span-2 md:col-span-1">
                    <div className="text-slate-500 text-[10px] uppercase font-semibold">Protokol / Server</div>
                    <div className="text-sm font-mono font-bold text-cyan-400 truncate">
                      {broadcastConfig.protocol.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Stream Target Info */}
              {broadcast.isStreaming && broadcast.serverUrl && (
                <div className="mt-3 text-[11px] font-mono text-emerald-400/90 bg-emerald-950/30 px-2.5 py-1 rounded border border-emerald-800/40 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Terhubung ke {broadcast.serverUrl} {broadcast.mount}</span>
                </div>
              )}
            </div>

            {/* Broadcast Controls */}
            <div className="flex items-center gap-3">
              {!broadcast.isStreaming ? (
                <button
                  onClick={() => startBroadcast()}
                  disabled={isBroadcastBusy}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4.93 4.93a10 10 0 0 1 14.14 0" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                  </svg>
                  Mulai Siaran (Go Live)
                </button>
              ) : (
                <button
                  onClick={() => stopBroadcast()}
                  disabled={isBroadcastBusy}
                  className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-red-500/50 text-red-400 font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Akhiri Siaran (Disconnect)
                </button>
              )}
            </div>

            {/* Broadcast Server Configuration Form */}
            <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Konfigurasi Server Streaming (Icecast 2 / SHOUTcast)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Protocol */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Protokol Server</label>
                  <select
                    value={broadcastConfig.protocol}
                    onChange={(e) => updateBroadcastConfig({ protocol: e.target.value as BroadcastProtocol })}
                    disabled={broadcast.isStreaming}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="icecast2">Icecast 2 (HTTP SOURCE Protocol)</option>
                    <option value="shoutcast">SHOUTcast DNAS Protocol</option>
                  </select>
                </div>

                {/* Server Address */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Alamat Server (Host:Port)</label>
                  <input
                    type="text"
                    value={broadcastConfig.server}
                    onChange={(e) => updateBroadcastConfig({ server: e.target.value })}
                    disabled={broadcast.isStreaming}
                    placeholder="127.0.0.1:8000"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  />
                </div>

                {/* Mount Point */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Mount Point</label>
                  <input
                    type="text"
                    value={broadcastConfig.mount}
                    onChange={(e) => updateBroadcastConfig({ mount: e.target.value })}
                    disabled={broadcast.isStreaming}
                    placeholder="/live"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-400">Kata Sandi (Source Password)</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      {showPassword ? "Sembunyikan" : "Tampilkan"}
                    </button>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={broadcastConfig.password}
                    onChange={(e) => updateBroadcastConfig({ password: e.target.value })}
                    disabled={broadcast.isStreaming}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  />
                </div>

                {/* Bitrate */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Bitrate Audio</label>
                  <select
                    value={broadcastConfig.bitrateKbps}
                    onChange={(e) => updateBroadcastConfig({ bitrateKbps: Number(e.target.value) })}
                    disabled={broadcast.isStreaming}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value={128}>128 kbps (Standard Mobile Streaming)</option>
                    <option value={192}>192 kbps (High Quality Web Stream)</option>
                    <option value={256}>256 kbps (Premium Audio)</option>
                    <option value={320}>320 kbps (Maximum High Fidelity Broadcast)</option>
                  </select>
                </div>

                {/* Station Name */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Nama Stasiun Radio</label>
                  <input
                    type="text"
                    value={broadcastConfig.stationName}
                    onChange={(e) => updateBroadcastConfig({ stationName: e.target.value })}
                    disabled={broadcast.isStreaming}
                    placeholder="DJDeX Radio Live"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  />
                </div>

                {/* Genre */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Genre Musik</label>
                  <input
                    type="text"
                    value={broadcastConfig.genre}
                    onChange={(e) => updateBroadcastConfig({ genre: e.target.value })}
                    disabled={broadcast.isStreaming}
                    placeholder="Electronic / Club Mix"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Deskripsi Siaran</label>
                  <input
                    type="text"
                    value={broadcastConfig.description}
                    onChange={(e) => updateBroadcastConfig({ description: e.target.value })}
                    disabled={broadcast.isStreaming}
                    placeholder="Live DJ Mix Powered by DJDeX Workstation"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
