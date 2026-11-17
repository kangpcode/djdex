import { useState } from "react";

import {
  formatBpm,
  formatDb,
  formatInt,
  formatMs,
  formatPitchPercent,
  formatSampleRate,
  formatSemitones,
  formatTime,
} from "../lib/format";
import type { DeckId, FxType } from "../lib/ipc";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { useFxStore } from "../stores/fxStore";
import { useSamplerStore } from "../stores/samplerStore";
import { useSkinStore } from "../stores/skinStore";
import { Platter, type PlatterMode } from "./Platter";
import { Fader3D } from "./ui/Fader3D";
import { Knob3D } from "./ui/Knob3D";
import { LevelMeter } from "./ui/LevelMeter";
import { Panel } from "./ui/Panel";
import { PioneerButton } from "./ui/PioneerButton";
import { Waveform } from "./Waveform";

type PadMode = "hotcue" | "padfx" | "sampler" | "beatjump" | "looproll";

const FX_OPTIONS: Array<{ value: FxType; label: string }> = [
  { value: "bypass", label: "BYPASS" },
  { value: "delay", label: "DELAY" },
  { value: "echo", label: "ECHO" },
  { value: "reverb", label: "REVERB" },
  { value: "flanger", label: "FLANGER" },
  { value: "phaser", label: "PHASER" },
  { value: "chorus", label: "CHORUS" },
  { value: "bitcrusher", label: "BITCRUSH" },
  { value: "gater", label: "GATER" },
  { value: "trans", label: "TRANS" },
  { value: "roll", label: "ROLL" },
  { value: "brake", label: "BRAKE" },
  { value: "filter-sweep", label: "FILTER SW" },
  { value: "noise", label: "NOISE" },
  { value: "wah", label: "WAH" },
];

const PAD_FX_PRESETS: Array<{
  name: string;
  fxType: FxType;
  wet: number;
  p1: number;
  color: string;
}> = [
  { name: "LPF ROLL", fxType: "filter-sweep", wet: 0.85, p1: 0.25, color: "#00e5ff" },
  { name: "HPF SWEEP", fxType: "filter-sweep", wet: 0.85, p1: 0.75, color: "#f97316" },
  { name: "ECHO 1/2", fxType: "echo", wet: 0.8, p1: 0.6, color: "#a855f7" },
  { name: "REVERB WASH", fxType: "reverb", wet: 0.9, p1: 0.85, color: "#ec4899" },
  { name: "FLANGER JET", fxType: "flanger", wet: 0.8, p1: 0.7, color: "#10b981" },
  { name: "BITCRUSH", fxType: "bitcrusher", wet: 0.8, p1: 0.4, color: "#eab308" },
  { name: "BRAKE", fxType: "brake", wet: 1.0, p1: 0.5, color: "#ef4444" },
  { name: "TRANS 1/4", fxType: "trans", wet: 0.9, p1: 0.5, color: "#06b6d4" },
];

const LOOP_ROLL_BEATS = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4];
const BEAT_JUMP_VALUES = [-8, -4, -2, -1, 1, 2, 4, 8];

export function DeckPanel({ deck }: { deck: DeckId }) {
  const useStore = deck === 0 ? useDeckAStore : useDeckBStore;
  const {
    status,
    waveform,
    loading,
    busy,
    error,
    chooseFile,
    toggle,
    seek,
    setCue,
    cueJump,
    setGainDb,
    setSpeed,
    setPitchRange,
    setKeylock,
    setSemitones,
    setBpm,
    tapTempo,
    setHotCueHere,
    triggerHotCue,
    clearHotCue,
    startLoop,
    manualLoopIn,
    manualLoopOut,
    exitLoop,
    halveLoop,
    doubleLoop,
    beatJump,
    syncToOther,
    setBend,
    resetBend,
    pendingLoopIn,
    unload,
    clearError,
  } = useStore();

  const [platterMode, setPlatterMode] = useState<PlatterMode>("vinyl");
  const [loopBeats, setLoopBeatsState] = useState(4);
  const [padMode, setPadMode] = useState<PadMode>("hotcue");
  const [showFxRack, setShowFxRack] = useState(false);
  const [showSamplerRack, setShowSamplerRack] = useState(false);

  // FX Store Integration (chain 0 for Deck A, chain 1 for Deck B)
  const fxStatus = useFxStore((state) => state.status);
  const updateFx = useFxStore((state) => state.update);
  const deckFxChain = fxStatus?.chains[deck];

  // Sampler Store Integration
  const samplerStatus = useSamplerStore((state) => state.status);
  const triggerSamplerPad = useSamplerStore((state) => state.triggerPad);
  const stopSamplerPad = useSamplerStore((state) => state.stopPad);
  const captureDeckToSampler = useSamplerStore((state) => state.captureDeck);

  const loaded = Boolean(status?.loaded);
  const playing = Boolean(status?.playing);
  const hotCues = status?.hotCues ?? Array(8).fill(null);
  const duration = status?.durationSecs ?? 0;
  const position = status?.positionSecs ?? 0;
  const cue = status?.cueSecs ?? 0;
  const remaining = Math.max(0, duration - position);
  const waveformDuration =
    waveform && waveform.durationSecs > 0 ? waveform.durationSecs : duration;
  const gainDb = status?.gainDb ?? 0;
  const speed = status?.speed ?? 1;
  const pitchRange = status?.pitchRange ?? 8;
  const keylock = status?.keylock ?? false;
  const semitones = status?.semitones ?? 0;
  const bpm = status?.bpm ?? 0;
  const effectiveBpm = bpm > 0 ? bpm * speed : 0;
  const firstBeat = status?.firstBeatSecs ?? 0;
  const camelot = status?.camelot ?? null;
  const keyName = status?.keyName ?? null;
  const minSpeed = 1 - pitchRange / 100;
  const maxSpeed = 1 + pitchRange / 100;
  const bpmKnown = bpm > 0;

  // Skin & Layout Engine
  const activeSkin = useSkinStore((state) => state.activeSkin);
  const deckAccent =
    deck === 0
      ? activeSkin?.theme.accentDeckA ?? "#00e5ff"
      : activeSkin?.theme.accentDeckB ?? "#ff007f";
  const skinLayout = activeSkin?.layout;
  const waveformLayout = skinLayout?.waveform;
  const waveformHeight = Math.min(320, Math.max(96, waveformLayout?.heightPx ?? 128));
  const waveformPosition = waveformLayout?.position ?? "top-stacked";
  const waveformOrientation = waveformLayout?.orientation ?? "horizontal";
  const platterStyle = skinLayout?.platter;
  const showScratchPads = skinLayout?.showScratchPads ?? false;

  const cuePalette = [
    activeSkin?.theme.accentDeckA ?? "#00e5ff",
    activeSkin?.theme.accentDeckB ?? "#f472b6",
    activeSkin?.theme.accentDeckC ?? "#fbbf24",
    activeSkin?.theme.accentDeckD ?? "#a78bfa",
  ];

  // Helper untuk memicu Pad FX
  const handlePadFxDown = (preset: (typeof PAD_FX_PRESETS)[0]) => {
    if (!loaded) return;
    void updateFx({
      chain: deck,
      slot: 0,
      enabled: true,
      fxType: preset.fxType,
      wet: preset.wet,
      p1: preset.p1,
    });
  };

  const handlePadFxUp = () => {
    if (!loaded) return;
    void updateFx({
      chain: deck,
      slot: 0,
      enabled: false,
      wet: 0,
    });
  };

  const renderWaveform = () => (
    <div
      className="relative overflow-hidden rounded-xl border border-[#1b2738] bg-[#03060c] shadow-inner"
      style={{ height: waveformHeight }}
    >
      <Waveform
        peaks={waveform?.peaks ?? []}
        duration={waveformDuration}
        position={position}
        cue={cue}
        bpm={bpm}
        firstBeat={firstBeat}
        enabled={loaded && waveformDuration > 0}
        orientation={waveformOrientation}
        showBeatgrid={waveformLayout?.showBeatgrid ?? true}
        accent={deckAccent}
        onSeek={(seconds) => void seek(seconds)}
      />

      {!loaded ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#040810]/85 px-4 text-center">
          <p className="text-sm font-display font-bold text-slate-200">
            DRAG &amp; DROP TRACK KE SINI
          </p>
          <p className="text-[11px] text-slate-400">
            MP3 · FLAC · WAV · OGG · AAC/M4A · AIFF · ALAC
          </p>
          <button
            type="button"
            className="btn btn-primary pointer-events-auto mt-1 px-4 py-1.5 text-xs font-bold shadow-md"
            onClick={() => void chooseFile()}
            disabled={loading}
          >
            {loading ? "Memuat…" : "Pilih File Audio"}
          </button>
        </div>
      ) : null}

      {loaded && !waveform ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
          <span className="chip border-cyan/40 text-cyan-soft font-mono text-xs">
            Menganalisis Waveform…
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <Panel
      title={`Deck ${deck === 0 ? "A" : "B"}`}
      accentColor={deckAccent}
      subtitle="Symphonia Pro Decoder · 64-bit Audio DSP Engine"
      actions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowFxRack(!showFxRack)}
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition ${
              showFxRack
                ? "bg-purple-500/25 border-purple-400 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                : "bg-[#0f1726] border-[#1e2a3c] text-slate-400 hover:text-slate-200"
            }`}
            title="Buka / Tutup Rack FX Deck Langsung"
          >
            {showFxRack ? "✕ FX RACK" : "+ FX RACK"}
          </button>

          <button
            type="button"
            onClick={() => setShowSamplerRack(!showSamplerRack)}
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition ${
              showSamplerRack
                ? "bg-pink-500/25 border-pink-400 text-pink-300 shadow-[0_0_8px_rgba(244,114,182,0.4)]"
                : "bg-[#0f1726] border-[#1e2a3c] text-slate-400 hover:text-slate-200"
            }`}
            title="Buka / Tutup Quick Sampler Deck Langsung"
          >
            {showSamplerRack ? "✕ SAMPLER" : "+ SAMPLER"}
          </button>

          <span className="chip text-[10px]">
            <span className={`led ${loaded ? "led-on" : ""}`} />
            {loaded ? "ONLINE" : "NO TRACK"}
          </span>

          <button
            type="button"
            className="btn px-2.5 py-1 text-xs font-bold"
            onClick={() => void chooseFile()}
            disabled={loading}
          >
            {loading ? "…" : "Load"}
          </button>
        </div>
      }
    >
      {/* Waveform Screen */}
      {waveformPosition !== "hidden" && waveformPosition !== "bottom" ? renderWaveform() : null}

      {/* Expandable Deck FX Rack (VirtualDJ / Rekordbox Style) */}
      {showFxRack && (
        <div className="mt-3 p-3 rounded-xl bg-[#080d16] border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-900/40">
            <span className="font-display text-xs font-bold text-purple-300 tracking-wider">
              DECK {deck === 0 ? "A" : "B"} FX RACK (3 SLOTS)
            </span>
            <span className="text-[10px] font-mono text-slate-400">Beat-Synced DSP</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((slotIdx) => {
              const slot = deckFxChain?.slots[slotIdx];
              const fxType = slot?.fxType ?? "bypass";
              const enabled = slot?.enabled ?? false;
              const wet = slot?.wet ?? 0;
              const p1 = slot?.p1 ?? 0.5;

              return (
                <div
                  key={slotIdx}
                  className="flex flex-col items-center p-2 rounded-lg bg-[#05080f] border border-[#182335]"
                >
                  <div className="w-full flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[9px] font-bold text-slate-400">
                      FX {slotIdx + 1}
                    </span>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-bold border transition ${
                        enabled
                          ? "bg-purple-500/30 border-purple-400 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                          : "bg-[#0b101a] border-[#1d2b3f] text-slate-500"
                      }`}
                      onClick={() =>
                        void updateFx({
                          chain: deck,
                          slot: slotIdx,
                          enabled: !enabled,
                        })
                      }
                    >
                      {enabled ? "ON" : "OFF"}
                    </button>
                  </div>

                  <select
                    className="w-full bg-[#0d1422] border border-[#233146] text-slate-200 text-[10px] rounded px-1 py-0.5 mb-2 font-mono"
                    value={fxType}
                    onChange={(e) =>
                      void updateFx({
                        chain: deck,
                        slot: slotIdx,
                        fxType: e.target.value as FxType,
                        enabled: true,
                      })
                    }
                  >
                    {FX_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <Knob3D
                      label="W/D"
                      size="sm"
                      value={wet}
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={0}
                      onChange={(v) => void updateFx({ chain: deck, slot: slotIdx, wet: v })}
                      display={`${Math.round(wet * 100)}%`}
                      accentColor="#c084fc"
                    />
                    <Knob3D
                      label="PARAM"
                      size="sm"
                      value={p1}
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={0.5}
                      onChange={(v) => void updateFx({ chain: deck, slot: slotIdx, p1: v })}
                      display={`${Math.round(p1 * 100)}%`}
                      accentColor="#e879f9"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Deck Quick Sampler Strip */}
      {showSamplerRack && (
        <div className="mt-3 p-3 rounded-xl bg-[#080d16] border border-pink-500/30 shadow-[0_0_15px_rgba(244,114,182,0.15)] animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-pink-900/40">
            <span className="font-display text-xs font-bold text-pink-300 tracking-wider">
              DECK {deck === 0 ? "A" : "B"} QUICK SAMPLER &amp; CAPTURE
            </span>
            <span className="text-[10px] font-mono text-slate-400">Direct Rip &amp; Drop</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((slotIdx) => {
              const pad = samplerStatus?.pads[slotIdx];
              const isPlaying = pad?.isPlaying ?? false;
              const isLoaded = pad?.loaded ?? false;

              return (
                <div
                  key={slotIdx}
                  className="flex flex-col items-center p-2 rounded-lg bg-[#05080f] border border-[#182335]"
                >
                  <span className="font-mono text-[9px] font-bold text-slate-300 truncate w-full text-center">
                    {pad?.name || `Sample ${slotIdx + 1}`}
                  </span>

                  <div className="flex gap-1.5 mt-2 w-full">
                    <button
                      type="button"
                      className={`flex-1 py-1 text-[10px] font-mono font-bold rounded border transition ${
                        isPlaying
                          ? "bg-pink-500/40 border-pink-400 text-pink-200 shadow-[0_0_10px_#f472b6] animate-pulse"
                          : isLoaded
                            ? "bg-[#141e30] border-[#293d5a] text-slate-200 hover:border-pink-500"
                            : "bg-[#090d16] border-[#182230] text-slate-600"
                      }`}
                      onClick={() => void triggerSamplerPad(slotIdx)}
                      title={`Play Sample ${slotIdx + 1}`}
                    >
                      {isPlaying ? "PLAYING" : "PLAY"}
                    </button>
                    {isPlaying && (
                      <button
                        type="button"
                        className="px-1.5 py-1 text-[9px] font-mono bg-red-500/20 border border-red-500/40 text-red-400 rounded"
                        onClick={() => void stopSamplerPad(slotIdx)}
                      >
                        ■
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    className="mt-1.5 w-full py-0.5 text-[8.5px] font-mono text-slate-400 hover:text-cyan-300 border border-[#182333] hover:border-cyan-500/50 rounded transition"
                    onClick={() => void captureDeckToSampler(slotIdx, deck, 4)}
                    disabled={!loaded}
                    title="Capture / Rip 4 beat loop dari deck ini langsung ke pad"
                  >
                    CAP 4B
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Track Info & Hardware Digital Display Bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e17] border border-[#1c293c]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {status?.codec ? <span className="chip font-mono text-[9px]">{status.codec}</span> : null}
            {status?.sourceSampleRate ? (
              <span className="chip font-mono text-[9px]">
                {formatSampleRate(status.sourceSampleRate)} → {formatSampleRate(status.engineSampleRate)}
              </span>
            ) : null}
            {status?.channels ? (
              <span className="chip font-mono text-[9px]">{status.channels} ch</span>
            ) : null}
            <span className="chip font-mono text-[9px]">
              Buf {formatInt(Math.round(status?.bufferedMs ?? 0))} ms
            </span>
          </div>

          <h3 className="mt-1 truncate font-display text-lg font-bold text-slate-100">
            {status?.fileName ?? "Belum Ada Track Dimuat"}
          </h3>
          <p className="text-[10px] font-mono text-slate-400">
            {loaded
              ? `Cue point: ${formatTime(cue)} · Underrun: ${status?.underruns ?? 0}`
              : "Klik Load atau drag track audio ke deck."}
          </p>
        </div>

        {/* Pioneer CDJ Glowing Digital Time Readout */}
        <div className="flex items-center gap-4 text-right bg-[#05080e] border border-[#162130] py-1.5 px-3 rounded-lg shadow-inner">
          <div>
            <span className="block text-[8px] font-mono text-slate-400 uppercase tracking-widest">
              ELAPSED
            </span>
            <div className="font-mono text-xl font-bold tracking-tight" style={{ color: deckAccent }}>
              {formatTime(position)}
            </div>
          </div>
          <div className="border-l border-[#1a2638] pl-3">
            <span className="block text-[8px] font-mono text-slate-400 uppercase tracking-widest">
              REMAIN
            </span>
            <div className="font-mono text-sm font-semibold text-slate-400">
              −{formatTime(remaining)}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Deck Section: CDJ Jog Wheel (Left) + Vertical Pitch Fader Section (Right) */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] items-start">
        {/* Left: 3D Pioneer CDJ Jog Wheel Platter */}
        <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#070b13] border border-[#182436] shadow-md">
          <Platter
            position={position}
            duration={duration}
            playing={playing}
            bpm={bpm}
            cue={cue}
            mode={platterMode}
            onModeChange={setPlatterMode}
            onScratch={seek}
            onBend={setBend}
            onBendEnd={resetBend}
            disabled={!loaded}
            size={platterStyle?.size ?? "standard"}
            vinylTexture={platterStyle?.vinylTexture ?? true}
            centerDisplay={platterStyle?.centerDisplay ?? true}
            accent={deckAccent}
            keyCamelot={camelot}
          />
        </div>

        {/* Right: Vertical Pioneer Pitch / Tempo Strip */}
        <div className="flex flex-col items-center p-3 rounded-xl bg-[#070b13] border border-[#182436] shadow-md min-w-[145px]">
          {/* Pitch Range Selector */}
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase">RANGE</span>
            <div className="flex gap-1">
              {[8, 16, 50].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`px-1.5 py-0.5 text-[8.5px] font-mono font-bold rounded border transition ${
                    pitchRange === r
                      ? "bg-cyan-500/25 border-cyan-400 text-cyan-300"
                      : "bg-[#0c121e] border-[#1c2738] text-slate-400"
                  }`}
                  onClick={() => void setPitchRange(r)}
                  disabled={!loaded}
                >
                  ±{r}%
                </button>
              ))}
            </div>
          </div>

          {/* Master Tempo / Key Lock Button */}
          <button
            type="button"
            className={`w-full my-1.5 py-1 text-[9.5px] font-mono font-bold rounded border transition-all ${
              keylock
                ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                : "bg-[#0c121e] border-[#202e42] text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => void setKeylock(!keylock)}
            disabled={!loaded}
            title="Master Tempo / Key Lock: Nada tetap terkunci saat tempo berubah"
          >
            MASTER TEMPO
          </button>

          {/* Vertical Pitch Fader (Pioneer Style) */}
          <div className="my-1 py-1">
            <Fader3D
              label=""
              value={speed}
              min={minSpeed}
              max={maxSpeed}
              step={0.001}
              defaultValue={1}
              onChange={(val) => void setSpeed(val)}
              display={formatPitchPercent(speed)}
              orientation="vertical"
              lengthPx={160}
              accentColor={deckAccent}
              disabled={!loaded}
              hint="Tempo Pitch Fader. Double-click untuk kembali ke 0%."
            />
          </div>

          {/* Pitch Reset / Center Indicator */}
          <button
            type="button"
            className="w-full mt-1 py-0.5 text-[8.5px] font-mono text-slate-400 hover:text-cyan-300 border border-[#182333] rounded"
            onClick={() => void setSpeed(1)}
            disabled={!loaded}
            title="Reset tempo ke 0.0%"
          >
            RESET 0.0%
          </button>

          {/* Semitones Key Shift */}
          <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-[#162132]">
            <button
              type="button"
              className="w-5 h-5 flex items-center justify-center font-bold text-xs bg-[#0f1726] border border-[#223146] text-slate-300 rounded active:scale-95"
              onClick={() => void setSemitones(semitones - 1)}
              disabled={!loaded || !keylock}
            >
              −
            </button>
            <span className="font-mono text-[9px] font-bold text-pink-300">
              {formatSemitones(semitones)}
            </span>
            <button
              type="button"
              className="w-5 h-5 flex items-center justify-center font-bold text-xs bg-[#0f1726] border border-[#223146] text-slate-300 rounded active:scale-95"
              onClick={() => void setSemitones(semitones + 1)}
              disabled={!loaded || !keylock}
            >
              +
            </button>
          </div>

          {/* BPM & Key Box */}
          <div className="w-full mt-2 pt-2 border-t border-[#162132] text-center">
            <span className="block font-mono text-[8px] text-slate-400 uppercase">TEMPO / KEY</span>
            <div className="font-mono text-sm font-black text-cyan-300">
              {formatBpm(bpm)}
              {effectiveBpm > 0 && effectiveBpm !== bpm && (
                <span className="block text-[8px] text-slate-400 font-normal">
                  eff {effectiveBpm.toFixed(2)}
                </span>
              )}
            </div>
            <div className="font-mono text-xs font-bold text-pink-400 mt-0.5">
              {camelot ?? "—"} <span className="text-[9px] text-slate-400">{keyName ?? ""}</span>
            </div>

            <div className="flex items-center justify-center gap-1 mt-1">
              <button
                type="button"
                className="px-1 text-[8px] font-mono bg-[#0c121e] border border-[#1b2636] text-slate-400 rounded"
                onClick={() => void setBpm(bpm / 2)}
                disabled={!loaded || !bpmKnown}
              >
                /2
              </button>
              <button
                type="button"
                className="px-1 text-[8px] font-mono bg-[#0c121e] border border-[#1b2636] text-slate-400 rounded"
                onClick={() => void setBpm(bpm * 2)}
                disabled={!loaded || !bpmKnown}
              >
                x2
              </button>
              <button
                type="button"
                className="px-1 text-[8px] font-mono bg-[#0c121e] border border-[#1b2636] text-slate-400 rounded"
                onClick={() => void tapTempo()}
                disabled={!loaded}
              >
                TAP
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Transport Controls & Performance Pad Strip */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[auto_1fr] items-start">
        {/* Left: Pioneer CDJ Large Circular Play & Cue Buttons */}
        <div className="flex flex-col items-center gap-3 p-3 rounded-xl bg-[#070b13] border border-[#182436] shadow-md">
          <div className="flex items-center gap-3">
            <PioneerButton
              type="cue"
              active={!playing && position === cue}
              disabled={!loaded || busy}
              onClick={() => void cueJump()}
              title="CUE Jump: Lompat ke posisi Cue point dan pause"
            />
            <PioneerButton
              type="play"
              active={playing}
              disabled={!loaded || busy}
              onClick={() => void toggle()}
              title="PLAY / PAUSE (Space)"
            />
          </div>

          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              className="flex-1 py-1.5 px-2 text-[10px] font-mono font-bold rounded border bg-[#0d1420] border-[#223146] text-amber-400 hover:border-amber-400/80 active:scale-95 transition"
              onClick={() => void setCue()}
              disabled={!loaded || busy}
              title="Set Cue Point di posisi saat ini"
            >
              SET CUE
            </button>

            <button
              type="button"
              className="flex-1 py-1.5 px-2 text-[10px] font-mono font-bold rounded border bg-cyan-500/20 border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 shadow-[0_0_8px_rgba(0,229,255,0.25)] active:scale-95 transition"
              onClick={() => void syncToOther()}
              disabled={!loaded || !bpmKnown}
              title="Beat Sync ke Deck lain"
            >
              SYNC
            </button>
          </div>

          <div className="flex items-center justify-between gap-1 w-full text-[9px] font-mono text-slate-400">
            <button
              type="button"
              className="px-2 py-1 bg-[#0c121e] border border-[#1c2738] rounded hover:text-slate-200"
              onClick={() => void seek(position - 10)}
              disabled={!loaded}
            >
              −10s
            </button>
            <button
              type="button"
              className="px-2 py-1 bg-[#0c121e] border border-[#1c2738] rounded hover:text-slate-200"
              onClick={() => void seek(position + 10)}
              disabled={!loaded}
            >
              +10s
            </button>
            <button
              type="button"
              className="px-2 py-1 bg-[#0c121e] border border-[#1c2738] rounded hover:text-red-400"
              onClick={() => void unload()}
              disabled={!loaded || busy}
            >
              EJECT
            </button>
          </div>
        </div>

        {/* Right: Performance Pads Multi-Mode & Loop Section */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#070b13] border border-[#182436] shadow-md">
          {/* Pad Mode Selector Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-[#162132]">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: "hotcue", label: "HOT CUE" },
                  { id: "padfx", label: "PAD FX" },
                  { id: "sampler", label: "SAMPLER" },
                  { id: "beatjump", label: "BEAT JUMP" },
                  { id: "looproll", label: "LOOP ROLL" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded border transition ${
                    padMode === mode.id
                      ? "bg-[#182840] border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.3)]"
                      : "bg-[#0b101a] border-[#1a2538] text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => setPadMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Loop Controls */}
            <div className="flex items-center gap-1">
              <select
                className="bg-[#0c121e] border border-[#1e2a3c] text-slate-300 text-[10px] rounded px-1.5 py-1 font-mono"
                value={loopBeats}
                onChange={(e) => setLoopBeatsState(Number(e.target.value))}
                disabled={!loaded}
              >
                {[1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32].map((v) => (
                  <option key={v} value={v}>
                    {v < 1 ? `1/${1 / v}` : v} BEAT
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`px-2 py-1 text-[10px] font-mono font-bold rounded border transition ${
                  status?.loopActive
                    ? "bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    : "bg-[#0c121e] border-[#1e2a3c] text-slate-400 hover:text-slate-200"
                }`}
                onClick={() => {
                  if (status?.loopActive) {
                    void exitLoop();
                  } else {
                    void startLoop(loopBeats);
                  }
                }}
                disabled={!loaded || !bpmKnown}
              >
                {status?.loopActive ? "EXIT LOOP" : "AUTO LOOP"}
              </button>

              <button
                type="button"
                className="px-1.5 py-1 text-[9px] font-mono bg-[#0c121e] border border-[#1e2a3c] text-slate-400 hover:text-slate-200 rounded"
                onClick={() => void halveLoop()}
                disabled={!status?.loopActive}
              >
                ½
              </button>
              <button
                type="button"
                className="px-1.5 py-1 text-[9px] font-mono bg-[#0c121e] border border-[#1e2a3c] text-slate-400 hover:text-slate-200 rounded"
                onClick={() => void doubleLoop()}
                disabled={!status?.loopActive}
              >
                ×2
              </button>

              <button
                type="button"
                className="px-1.5 py-1 text-[9px] font-mono bg-[#0c121e] border border-[#1e2a3c] text-slate-400 hover:text-slate-200 rounded"
                onClick={() => void manualLoopIn()}
                disabled={!loaded}
                title="Manual Loop In"
              >
                IN
              </button>
              <button
                type="button"
                className="px-1.5 py-1 text-[9px] font-mono bg-[#0c121e] border border-[#1e2a3c] text-slate-400 hover:text-slate-200 rounded"
                onClick={() => void manualLoopOut()}
                disabled={!loaded || pendingLoopIn == null}
                title="Manual Loop Out"
              >
                OUT
              </button>
            </div>
          </div>

          {/* 8 Chunky Rubber Silicon 3D Performance Pads */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
            {/* Mode 1: HOT CUE */}
            {padMode === "hotcue" &&
              Array.from({ length: 8 }).map((_, slot) => {
                const cuePos = hotCues[slot] ?? null;
                const color = cuePalette[slot % cuePalette.length];

                return (
                  <button
                    key={slot}
                    type="button"
                    className="pad-silicon-3d flex flex-col items-center justify-center p-2 min-h-[46px] rounded-lg border text-center transition-transform"
                    style={{
                      borderColor: cuePos != null ? color : "#26354a",
                      backgroundColor: cuePos != null ? `${color}28` : "#0b111c",
                      color: cuePos != null ? color : "#64748b",
                      boxShadow:
                        cuePos != null
                          ? `0 0 10px ${color}44, inset 0 1px 2px rgba(255,255,255,0.2)`
                          : "none",
                    }}
                    onClick={(e) => {
                      if (e.shiftKey || cuePos == null) {
                        void setHotCueHere(slot);
                      } else {
                        void triggerHotCue(slot);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (cuePos != null) void clearHotCue(slot);
                    }}
                    disabled={!loaded}
                    title={`Hot Cue ${slot + 1}: Klik jump, Shift+klik set, Klik kanan hapus`}
                  >
                    <span className="font-mono text-xs font-black">{slot + 1}</span>
                    <span className="font-mono text-[8px] mt-0.5">
                      {cuePos != null ? formatTime(cuePos) : "EMPTY"}
                    </span>
                  </button>
                );
              })}

            {/* Mode 2: PAD FX */}
            {padMode === "padfx" &&
              PAD_FX_PRESETS.map((preset, slot) => (
                <button
                  key={slot}
                  type="button"
                  className="pad-silicon-3d flex flex-col items-center justify-center p-2 min-h-[46px] rounded-lg border text-center transition-transform active:scale-95"
                  style={{
                    borderColor: preset.color,
                    backgroundColor: `${preset.color}20`,
                    color: preset.color,
                  }}
                  onPointerDown={() => handlePadFxDown(preset)}
                  onPointerUp={handlePadFxUp}
                  onPointerLeave={handlePadFxUp}
                  disabled={!loaded}
                  title={`Punch-in FX: Tahan untuk aktifkan ${preset.name}`}
                >
                  <span className="font-mono text-[9px] font-black">{preset.name}</span>
                  <span className="font-mono text-[7.5px] opacity-80 mt-0.5">HOLD FX</span>
                </button>
              ))}

            {/* Mode 3: SAMPLER */}
            {padMode === "sampler" &&
              Array.from({ length: 8 }).map((_, slot) => {
                const pad = samplerStatus?.pads[slot];
                const isPlaying = pad?.isPlaying ?? false;
                const isLoaded = pad?.loaded ?? false;

                return (
                  <button
                    key={slot}
                    type="button"
                    className="pad-silicon-3d flex flex-col items-center justify-center p-2 min-h-[46px] rounded-lg border text-center transition-transform active:scale-95"
                    style={{
                      borderColor: isPlaying ? "#f472b6" : isLoaded ? "#38bdf8" : "#26354a",
                      backgroundColor: isPlaying
                        ? "rgba(244, 114, 182, 0.35)"
                        : isLoaded
                          ? "rgba(56, 189, 248, 0.15)"
                          : "#0b111c",
                      color: isPlaying ? "#fff" : isLoaded ? "#7dd3fc" : "#64748b",
                      boxShadow: isPlaying ? "0 0 12px rgba(244,114,182,0.8)" : "none",
                    }}
                    onClick={() => {
                      if (isPlaying) {
                        void stopSamplerPad(slot);
                      } else {
                        void triggerSamplerPad(slot);
                      }
                    }}
                    title={`Trigger Sampler Pad ${slot + 1}`}
                  >
                    <span className="font-mono text-[9px] font-black truncate w-full px-1">
                      {pad?.name || `PAD ${slot + 1}`}
                    </span>
                    <span className="font-mono text-[7.5px] mt-0.5">
                      {isPlaying ? "PLAYING" : isLoaded ? "SAMPLE" : "EMPTY"}
                    </span>
                  </button>
                );
              })}

            {/* Mode 4: BEAT JUMP */}
            {padMode === "beatjump" &&
              BEAT_JUMP_VALUES.map((beats) => (
                <button
                  key={beats}
                  type="button"
                  className="pad-silicon-3d flex flex-col items-center justify-center p-2 min-h-[46px] rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 active:scale-95 transition"
                  onClick={() => void beatJump(beats)}
                  disabled={!loaded || !bpmKnown}
                  title={`Lompat ${beats > 0 ? `+${beats}` : beats} beat`}
                >
                  <span className="font-mono text-xs font-black">
                    {beats > 0 ? `+${beats}` : beats}
                  </span>
                  <span className="font-mono text-[7.5px] opacity-75">BEATS</span>
                </button>
              ))}

            {/* Mode 5: LOOP ROLL */}
            {padMode === "looproll" &&
              LOOP_ROLL_BEATS.map((beats) => (
                <button
                  key={beats}
                  type="button"
                  className="pad-silicon-3d flex flex-col items-center justify-center p-2 min-h-[46px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 active:scale-95 transition"
                  onPointerDown={() => {
                    if (loaded && bpmKnown) void startLoop(beats);
                  }}
                  onPointerUp={() => void exitLoop()}
                  onPointerLeave={() => void exitLoop()}
                  disabled={!loaded || !bpmKnown}
                  title={`Slip Loop Roll ${beats < 1 ? `1/${1 / beats}` : beats} beat (tahan tombol)`}
                >
                  <span className="font-mono text-xs font-black">
                    {beats < 1 ? `1/${1 / beats}` : beats}
                  </span>
                  <span className="font-mono text-[7.5px] opacity-75">ROLL</span>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Waveform Bottom Position if requested by skin */}
      {waveformPosition === "bottom" ? <div className="mt-3">{renderWaveform()}</div> : null}

      {/* Scratch Pads Skin Option */}
      {showScratchPads ? (
        <div className="mt-3 grid grid-cols-4 gap-1 p-2 rounded-xl bg-[#070b13] border border-[#182436]">
          {[-2, -1, 1, 2].map((beats) => (
            <button
              key={beats}
              type="button"
              className="btn py-2 text-[10px] tracking-[0.08em] font-mono font-bold"
              disabled={!loaded || !bpmKnown}
              onPointerDown={() => setBend(beats < 0 ? 0.92 : 1.08)}
              onPointerUp={() => resetBend()}
              onPointerLeave={() => resetBend()}
              onClick={() => void beatJump(beats)}
              title={`Scratch pad: nudge ${beats} beat (tahan untuk pitch bend)`}
            >
              {beats > 0 ? `+${beats}` : beats} BEAT NUDGE
            </button>
          ))}
        </div>
      ) : null}

      {/* Deck Gain Knob & Level Meter */}
      <div className="mt-3 flex items-center justify-between gap-4 p-3 rounded-xl bg-[#090e17] border border-[#1c293c]">
        <div className="flex items-center gap-3">
          <Knob3D
            label="DECK GAIN"
            size="sm"
            value={gainDb}
            min={-60}
            max={12}
            step={0.5}
            defaultValue={0}
            onChange={(v) => void setGainDb(v)}
            display={formatDb(gainDb)}
            disabled={!loaded}
            accentColor={deckAccent}
            hint="Deck input gain. Double-click untuk kembali ke 0 dB."
          />
          <div className="text-[10px] font-mono text-slate-400">
            <div>Cue pos: {formatTime(cue)}</div>
            <div>Buffer: {formatMs(status?.bufferedMs)}</div>
          </div>
        </div>

        <div className="flex-1 max-w-[240px]">
          <LevelMeter peak={status?.peak ?? 0} channelLabels={[`${deck === 0 ? "A" : "B"} L`, `${deck === 0 ? "A" : "B"} R`]} compact />
        </div>
      </div>

      {/* Error Banner */}
      {error ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger"
        >
          <span className="mt-0.5">▲</span>
          <p className="flex-1 whitespace-pre-wrap">{error}</p>
          <button
            type="button"
            onClick={clearError}
            className="rounded px-1 text-ink-dim hover:text-ink"
            aria-label="Tutup pesan error deck"
          >
            ✕
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
