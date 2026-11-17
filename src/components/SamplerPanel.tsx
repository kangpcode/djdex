import { useState } from "react";
import { useSamplerStore } from "../stores/samplerStore";
import type { DeckId, PadMode } from "../lib/ipc";
import { FlStudioStudio } from "./FlStudioStudio";
import { IconLoop, IconPiano, IconStop } from "./ui/Icons";
import { Panel } from "./ui/Panel";

const PAD_MODES: { value: PadMode; label: string }[] = [
  { value: "one-shot", label: "One-Shot" },
  { value: "loop", label: "Loop" },
  { value: "hold", label: "Hold" },
  { value: "stutter", label: "Stutter" },
  { value: "drum-pad", label: "Drum Pad" },
  { value: "cue-pad", label: "Cue Pad" },
];

const TRACK_LABELS = ["Kick", "Snare", "Hi-Hat", "Perc / Stab"];

export function SamplerPanel() {
  const status = useSamplerStore((state) => state.status);
  const activeBank = useSamplerStore((state) => state.activeBank);
  const isGrid16 = useSamplerStore((state) => state.isGrid16);
  const selectedPadId = useSamplerStore((state) => state.selectedPadId);

  const triggerPad = useSamplerStore((state) => state.triggerPad);
  const releasePad = useSamplerStore((state) => state.releasePad);
  const stopPad = useSamplerStore((state) => state.stopPad);
  const stopAll = useSamplerStore((state) => state.stopAll);
  const selectBank = useSamplerStore((state) => state.selectBank);
  const setVolume = useSamplerStore((state) => state.setVolume);
  const updatePad = useSamplerStore((state) => state.updatePad);
  const loadPadFile = useSamplerStore((state) => state.loadPadFile);
  const captureDeck = useSamplerStore((state) => state.captureDeck);
  const toggleSequencer = useSamplerStore((state) => state.toggleSequencer);
  const setSequencerStep = useSamplerStore((state) => state.setSequencerStep);
  const setSequencerParams = useSamplerStore((state) => state.setSequencerParams);
  const exportPack = useSamplerStore((state) => state.exportPack);
  const importPack = useSamplerStore((state) => state.importPack);
  const toggleGridSize = useSamplerStore((state) => state.toggleGridSize);
  const selectPad = useSamplerStore((state) => state.selectPad);

  const [activeTab, setActiveTab] = useState<"pads" | "sequencer" | "flstudio">("pads");
  const [sliceBeats, setSliceBeats] = useState<number>(4);

  const pads = status?.pads ?? [];
  const displayPads = isGrid16 ? pads : pads.slice(0, 8);
  const selectedPad = pads.find((p) => p.id === selectedPadId) ?? pads[0];
  const sequencer = status?.sequencer;
  const masterVolume = status?.masterVolume ?? 1.0;

  const handleOpenFileDialog = async (padId: number) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Audio Files",
            extensions: ["wav", "mp3", "flac", "ogg", "aac", "m4a", "aiff"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        void loadPadFile(padId, selected);
      }
    } catch {
      // dialog dibatalkan / gagal
    }
  };

  const handleExportPack = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        filters: [{ name: "DJDeX Sample Pack", extensions: ["zip"] }],
        defaultPath: `djdex_pack_bank_${String.fromCharCode(65 + activeBank)}.zip`,
      });
      if (path) {
        void exportPack(path);
      }
    } catch {
      // dibatalkan
    }
  };

  const handleImportPack = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "DJDeX Sample Pack", extensions: ["zip"] }],
      });
      if (selected && typeof selected === "string") {
        void importPack(selected);
      }
    } catch {
      // dibatalkan
    }
  };

  return (
    <Panel
      title="REMIXER / SAMPLER & STEP SEQUENCER"
      subtitle="16 Sample Pads per Bank · 12 Sound Kits (EDM, 808, House, FX, Angklung 16 Nada, Gendang Master, Goong 16 Nada, Sunda, Jawa, Japan, World, Remix Drops)"
      className="border-deck-800 bg-deck-950/80"
    >
      {/* Header Panel */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff]" />
            <span className="font-display text-xs font-bold tracking-[0.2em] text-ink-bright">
              REMIXER / SAMPLER
            </span>
          </div>

          {/* Tab Sub-View: Pads vs FL Studio vs Sequencer */}
          <div className="flex rounded-md border border-line bg-deck-900 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveTab("pads")}
              className={`rounded px-2.5 py-1 font-semibold transition ${
                activeTab === "pads"
                  ? "bg-cyan-500/20 text-cyan-300 shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              16 Pads Grid
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("flstudio")}
              className={`rounded px-2.5 py-1 font-semibold flex items-center gap-1.5 transition ${
                activeTab === "flstudio"
                  ? "bg-fuchsia-500/25 border border-fuchsia-400 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.3)]"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              <IconPiano className="w-3.5 h-3.5 text-fuchsia-400" />
              FL Studio &amp; Piano Roll
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sequencer")}
              className={`rounded px-2.5 py-1 font-semibold transition ${
                activeTab === "sequencer"
                  ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              16-Step Sequencer
            </button>
          </div>
        </div>

        {/* Bank Selector: 12 Full Banks (A - L) */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mr-0.5">
            Bank:
          </span>
          {["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map((b, idx) => {
            const isSelected = activeBank === idx;
            const bankName = status?.bankNames[idx] ?? `Bank ${b}`;
            return (
              <button
                key={b}
                type="button"
                onClick={() => void selectBank(idx)}
                title={`${b}: ${bankName}`}
                className={`group relative rounded border px-2 py-1 text-[10.5px] font-bold transition ${
                  isSelected
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
                    : "border-line bg-deck-900 text-ink-muted hover:border-deck-700 hover:text-ink"
                }`}
              >
                <span>{b}</span>
                <span className="ml-1 hidden text-[8px] font-normal opacity-70 xl:inline">
                  {bankName.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-dim">
              Master Vol:
            </span>
            <div className="w-20">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={masterVolume}
                onChange={(e) => void setVolume(Number(e.target.value))}
                className="fader h-1.5 w-full cursor-pointer accent-cyan-400"
                title="Sampler Master Volume"
              />
            </div>
            <span className="w-8 text-[10px] font-mono text-ink-dim">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => void stopAll()}
            className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold tracking-wider text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
          >
            MUTE ALL
          </button>

          <button
            type="button"
            onClick={toggleGridSize}
            className="rounded border border-line bg-deck-900 px-2 py-1 text-[10px] text-ink-muted hover:text-ink"
            title="Ganti tampilan 8 atau 16 pad"
          >
            {isGrid16 ? "16 Pads" : "8 Pads"}
          </button>

          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => void handleExportPack()}
              className="rounded border border-line bg-deck-900 px-2 py-1 text-[10px] text-ink-muted hover:border-cyan-500/40 hover:text-cyan-300"
              title="Ekspor bank ini sebagai sample pack .zip"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => void handleImportPack()}
              className="rounded border border-line bg-deck-900 px-2 py-1 text-[10px] text-ink-muted hover:border-cyan-500/40 hover:text-cyan-300"
              title="Impor sample pack .zip"
            >
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "flstudio" ? (
        <div className="mt-4">
          <FlStudioStudio />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Left: Pad Grid or Step Sequencer */}
        <div className="flex flex-col gap-3">
          {activeTab === "pads" ? (
            <div
              className={`grid gap-2.5 ${
                isGrid16
                  ? "grid-cols-4 grid-rows-4 sm:grid-cols-4"
                  : "grid-cols-4 grid-rows-2"
              }`}
            >
              {displayPads.map((pad) => {
                const isSelected = selectedPadId === pad.id;
                const isPlaying = pad.isPlaying;
                const padColor = pad.color || "#00e5ff";

                return (
                  <div
                    key={pad.id}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      selectPad(pad.id);
                      void triggerPad(pad.id, 1.0);
                    }}
                    onMouseUp={() => {
                      if (pad.mode === "hold") {
                        void releasePad(pad.id);
                      }
                    }}
                    className={`group relative flex min-h-[76px] cursor-pointer flex-col justify-between overflow-hidden rounded-lg border p-2 select-none transition-all duration-75 active:scale-[0.98] ${
                      isSelected
                        ? "border-cyan-400/80 shadow-[0_0_12px_rgba(0,229,255,0.25)]"
                        : "border-deck-700/60 bg-deck-900/60 hover:border-deck-600"
                    }`}
                    style={{
                      backgroundColor: isPlaying
                        ? `${padColor}25`
                        : isSelected
                        ? "rgba(15, 23, 42, 0.85)"
                        : "rgba(10, 15, 30, 0.65)",
                    }}
                  >
                    {/* Top Row: Pad Number, Quick Loop Toggle, Mute Group & Stop */}
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="font-mono font-bold text-ink-muted">
                        {(pad.id + 1).toString().padStart(2, "0")}
                      </span>
                      <div className="flex items-center gap-1">
                        {/* Quick Loop / One-Shot Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextMode = pad.mode === "loop" ? "one-shot" : "loop";
                            void updatePad(pad.id, { mode: nextMode });
                          }}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border transition ${
                            pad.mode === "loop"
                              ? "bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                              : "bg-deck-950/80 border-[#202e42] text-slate-400 hover:text-slate-200"
                          }`}
                          title={pad.mode === "loop" ? "Mode Loop Aktif (klik untuk One-Shot)" : "Klik untuk Mode Loop"}
                        >
                          <IconLoop className="w-2.5 h-2.5" />
                          <span>{pad.mode === "loop" ? "LOOP" : "SHOT"}</span>
                        </button>

                        {isPlaying && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void stopPad(pad.id);
                            }}
                            className="p-0.5 rounded bg-red-500/30 border border-red-400 text-red-300 hover:bg-red-500/50"
                            title="Hentikan sample ini"
                          >
                            <IconStop className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {pad.muteGroup !== null && (
                          <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[8px] font-bold text-amber-300">
                            MG{pad.muteGroup}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Pad Label */}
                    <div className="my-1 truncate font-display text-xs font-semibold tracking-wide text-ink-bright">
                      {pad.name}
                    </div>

                    {/* Bottom Row: Duration & Progress Bar */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[8.5px] text-ink-faint">
                        <span>
                          {pad.durationSecs > 0
                            ? `${pad.durationSecs.toFixed(2)}s`
                            : "Empty"}
                        </span>
                        {pad.pitchSemitones !== 0 && (
                          <span className="font-mono text-cyan-400">
                            {pad.pitchSemitones > 0 ? "+" : ""}
                            {pad.pitchSemitones}st
                          </span>
                        )}
                      </div>

                      {/* Progress Line */}
                      <div className="h-1 w-full overflow-hidden rounded-full bg-deck-800">
                        <div
                          className="h-full rounded-full transition-all duration-75"
                          style={{
                            width: `${(pad.progress * 100).toFixed(1)}%`,
                            backgroundColor: padColor,
                            boxShadow: isPlaying ? `0 0 6px ${padColor}` : "none",
                          }}
                        />
                      </div>
                    </div>

                    {/* Glowing highlight border when playing */}
                    {isPlaying && (
                      <div
                        className="pointer-events-none absolute inset-0 rounded-lg border-2 animate-pulse"
                        style={{ borderColor: padColor }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* 16-Step Sequencer View */
            <div className="flex flex-col gap-3 rounded-lg border border-line/60 bg-deck-900/40 p-3">
              {/* Sequencer Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/50 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleSequencer()}
                    className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold tracking-wider transition ${
                      sequencer?.running
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                        : "border-line bg-deck-800 text-ink-dim hover:text-ink"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        sequencer?.running
                          ? "bg-emerald-400 animate-ping"
                          : "bg-ink-muted"
                      }`}
                    />
                    {sequencer?.running ? "STOP" : "START"}
                  </button>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[10px] uppercase text-ink-dim">BPM:</span>
                    <input
                      type="number"
                      min={40}
                      max={220}
                      value={Math.round(sequencer?.bpm ?? 128)}
                      onChange={(e) =>
                        void setSequencerParams({ bpm: Number(e.target.value) })
                      }
                      className="w-14 rounded border border-line bg-deck-950 px-1.5 py-0.5 text-center font-mono text-xs text-ink-bright"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void setSequencerParams({
                        syncToMaster: !sequencer?.syncToMaster,
                      })
                    }
                    className={`rounded border px-2 py-1 text-[10px] font-bold transition ${
                      sequencer?.syncToMaster
                        ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                        : "border-line bg-deck-950 text-ink-muted hover:text-ink"
                    }`}
                  >
                    SYNC BPM
                  </button>
                </div>

                {/* Swing & Patterns */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase text-ink-dim">
                      Swing:
                    </span>
                    <div className="w-16">
                      <input
                        type="range"
                        min={0}
                        max={0.75}
                        step={0.05}
                        value={sequencer?.swing ?? 0}
                        onChange={(e) =>
                          void setSequencerParams({ swing: Number(e.target.value) })
                        }
                        className="fader h-1.5 w-full cursor-pointer accent-fuchsia-400"
                        title="Sequencer Swing Groove"
                      />
                    </div>
                    <span className="w-8 text-[10px] font-mono text-ink-dim">
                      {Math.round((sequencer?.swing ?? 0) * 100)}%
                    </span>
                  </div>

                  {/* Patterns 1..4 */}
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3].map((pat) => (
                      <button
                        key={pat}
                        type="button"
                        onClick={() =>
                          void setSequencerParams({ currentPattern: pat })
                        }
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                          sequencer?.currentPattern === pat
                            ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-300 shadow-[0_0_8px_rgba(217,70,239,0.3)]"
                            : "border-line bg-deck-950 text-ink-muted hover:text-ink"
                        }`}
                      >
                        P{pat + 1}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step Grid Tracks */}
              <div className="flex flex-col gap-2 pt-1">
                {[0, 1, 2, 3].map((track) => {
                  const trackPadId = sequencer?.padMappings[track] ?? track;
                  const trackPad = pads[trackPadId];
                  return (
                    <div
                      key={track}
                      className="flex items-center gap-2 rounded bg-deck-950/60 p-1.5"
                    >
                      {/* Track Header */}
                      <button
                        type="button"
                        onClick={() => {
                          selectPad(trackPadId);
                          void triggerPad(trackPadId, 1.0);
                        }}
                        className="w-24 truncate rounded border border-line/60 bg-deck-900 px-2 py-1 text-left text-[10.5px] font-bold text-ink-bright transition hover:border-cyan-400/60"
                        title="Klik untuk preview atau pilih pad"
                      >
                        <span className="text-[9px] text-cyan-400">
                          {track + 1}.
                        </span>{" "}
                        {trackPad?.name || TRACK_LABELS[track]}
                      </button>

                      {/* 16 Step Buttons */}
                      <div className="grid flex-1 grid-cols-16 gap-1">
                        {Array.from({ length: 16 }).map((_, step) => {
                          const isStepActive =
                            sequencer?.pattern.steps[track]?.[step] ?? false;
                          const isCurrent =
                            sequencer?.running && sequencer?.currentStep === step;
                          const isBeatStart = step % 4 === 0;

                          return (
                            <button
                              key={step}
                              type="button"
                              onClick={() =>
                                void setSequencerStep(
                                  track,
                                  step,
                                  !isStepActive
                                )
                              }
                              className={`h-7 rounded border text-[9px] font-mono transition-all duration-75 ${
                                isCurrent
                                  ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-deck-950"
                                  : ""
                              } ${
                                isStepActive
                                  ? track === 0
                                    ? "border-cyan-400 bg-cyan-400 text-deck-950 font-bold shadow-[0_0_8px_#00e5ff]"
                                    : track === 1
                                    ? "border-fuchsia-400 bg-fuchsia-400 text-deck-950 font-bold shadow-[0_0_8px_#e879f9]"
                                    : track === 2
                                    ? "border-amber-400 bg-amber-400 text-deck-950 font-bold shadow-[0_0_8px_#fbbf24]"
                                    : "border-emerald-400 bg-emerald-400 text-deck-950 font-bold shadow-[0_0_8px_#34d399]"
                                  : isBeatStart
                                  ? "border-deck-700 bg-deck-800/80 hover:bg-deck-700 text-ink-muted"
                                  : "border-deck-800 bg-deck-900/60 hover:bg-deck-800 text-ink-faint"
                              }`}
                            >
                              {step + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Selected Pad Inspector Drawer */}
        <div className="flex flex-col gap-3 rounded-lg border border-line/60 bg-deck-900/60 p-3.5">
          <div className="flex items-center justify-between border-b border-line/50 pb-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded"
                style={{ backgroundColor: selectedPad?.color || "#00e5ff" }}
              />
              <span className="font-display text-xs font-bold tracking-wider text-ink-bright">
                PAD {selectedPad ? selectedPad.id + 1 : "--"} INSPECTOR
              </span>
            </div>
            {selectedPad && (
              <button
                type="button"
                onClick={() => void stopPad(selectedPad.id)}
                className="rounded border border-line bg-deck-950 px-2 py-0.5 text-[10px] text-ink-muted hover:text-red-400"
              >
                Stop
              </button>
            )}
          </div>

          {selectedPad ? (
            <div className="flex flex-col gap-3 text-xs">
              {/* Pad Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                  Nama Sample
                </label>
                <input
                  type="text"
                  value={selectedPad.name}
                  onChange={(e) =>
                    void updatePad(selectedPad.id, { name: e.target.value })
                  }
                  className="rounded border border-line bg-deck-950 px-2.5 py-1 text-xs text-ink-bright focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Mode & Mute Group */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    Mode Trigger
                  </label>
                  <select
                    value={selectedPad.mode}
                    onChange={(e) =>
                      void updatePad(selectedPad.id, {
                        mode: e.target.value as PadMode,
                      })
                    }
                    className="rounded border border-line bg-deck-950 px-2 py-1 text-xs text-ink-bright focus:border-cyan-400 focus:outline-none"
                  >
                    {PAD_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    Mute Group
                  </label>
                  <select
                    value={
                      selectedPad.muteGroup === null
                        ? "none"
                        : selectedPad.muteGroup
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      void updatePad(selectedPad.id, {
                        muteGroup: val === "none" ? null : Number(val),
                      });
                    }}
                    className="rounded border border-line bg-deck-950 px-2 py-1 text-xs text-ink-bright focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="none">Off (None)</option>
                    <option value="1">Group 1 (Hi-Hats)</option>
                    <option value="2">Group 2</option>
                    <option value="3">Group 3</option>
                    <option value="4">Group 4</option>
                  </select>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px]">
                  <span className="font-bold uppercase tracking-wider text-ink-dim">
                    Pad Volume
                  </span>
                  <span className="font-mono text-cyan-400">
                    {Math.round(selectedPad.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2.0}
                  step={0.01}
                  value={selectedPad.volume}
                  onChange={(e) =>
                    void updatePad(selectedPad.id, { volume: Number(e.target.value) })
                  }
                  className="fader h-2 w-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Pitch Shift Slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px]">
                  <span className="font-bold uppercase tracking-wider text-ink-dim">
                    Pitch / Transpose
                  </span>
                  <span className="font-mono text-cyan-400">
                    {selectedPad.pitchSemitones > 0 ? "+" : ""}
                    {selectedPad.pitchSemitones} Semitone
                  </span>
                </div>
                <input
                  type="range"
                  min={-24}
                  max={24}
                  step={1}
                  value={selectedPad.pitchSemitones}
                  onChange={(e) =>
                    void updatePad(selectedPad.id, {
                      pitchSemitones: Number(e.target.value),
                    })
                  }
                  className="fader h-2 w-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Sync BPM Toggle */}
              <div className="flex items-center justify-between rounded border border-line/40 bg-deck-950/60 p-2">
                <div className="flex flex-col">
                  <span className="text-[10.5px] font-bold text-ink-bright">
                    Sync Tempo ke Master BPM
                  </span>
                  <span className="text-[9px] text-ink-dim">
                    Sesuaikan kecepatan playback dengan beatgrid
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={selectedPad.syncBpm}
                  onChange={(e) =>
                    void updatePad(selectedPad.id, { syncBpm: e.target.checked })
                  }
                  className="h-4 w-4 rounded accent-cyan-400"
                />
              </div>

              {/* Source Actions: Load File or Rip from Deck */}
              <div className="flex flex-col gap-2 border-t border-line/40 pt-2.5">
                <button
                  type="button"
                  onClick={() => void handleOpenFileDialog(selectedPad.id)}
                  className="flex items-center justify-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 py-1.5 text-xs font-bold text-cyan-300 transition hover:bg-cyan-500/20"
                >
                  Buka File Audio (WAV/MP3/FLAC)
                </button>

                <div className="flex items-center gap-2">
                  <select
                    value={sliceBeats}
                    onChange={(e) => setSliceBeats(Number(e.target.value))}
                    className="rounded border border-line bg-deck-950 px-2 py-1 text-[11px] text-ink-bright"
                  >
                    <option value={1}>1 Beat</option>
                    <option value={2}>2 Beats</option>
                    <option value={4}>4 Beats (1 Bar)</option>
                    <option value={8}>8 Beats (2 Bars)</option>
                    <option value={16}>16 Beats (4 Bars)</option>
                  </select>

                  <div className="grid flex-1 grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void captureDeck(selectedPad.id, 0 as DeckId, sliceBeats)
                      }
                      className="rounded border border-line bg-deck-950 py-1 text-[10px] font-bold text-ink-muted hover:border-cyan-400 hover:text-cyan-300"
                      title="Potong loop/bagian dari Deck A ke pad ini"
                    >
                      Potong Deck A
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void captureDeck(selectedPad.id, 1 as DeckId, sliceBeats)
                      }
                      className="rounded border border-line bg-deck-950 py-1 text-[10px] font-bold text-ink-muted hover:border-cyan-400 hover:text-cyan-300"
                      title="Potong loop/bagian dari Deck B ke pad ini"
                    >
                      Potong Deck B
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-ink-dim">
              Pilih satu pad di atas untuk melihat parameter.
            </div>
          )}
        </div>
      </div>
      )}
    </Panel>
  );
}
