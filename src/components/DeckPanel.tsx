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
import type { DeckId } from "../lib/ipc";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { Platter, type PlatterMode } from "./Platter";
import { LevelMeter } from "./ui/LevelMeter";
import { Panel } from "./ui/Panel";
import { Slider } from "./ui/Slider";
import { Waveform } from "./Waveform";

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
  const detectedBpm = status?.detectedBpm ?? 0;
  const effectiveBpm = bpm > 0 ? bpm * speed : 0;
  const firstBeat = status?.firstBeatSecs ?? 0;
  const camelot = status?.camelot ?? null;
  const keyName = status?.keyName ?? null;
  const minSpeed = 1 - pitchRange / 100;
  const maxSpeed = 1 + pitchRange / 100;
  const bpmKnown = bpm > 0;

  return (
    <Panel
      title={`Deck ${deck === 0 ? "A" : "B"}`}
      subtitle="Decoder Symphonia → resample → ring buffer lock-free → output"
      actions={
        <>
          <span className="chip">
            <span className={`led ${loaded ? "led-on" : ""}`} />
            {loaded ? "TRACK LOADED" : "NO TRACK"}
          </span>
          <button
            type="button"
            className="btn px-3 py-1.5 text-xs"
            onClick={() => void chooseFile()}
            disabled={loading}
          >
            {loading ? "Memuat…" : "Muat track"}
          </button>
        </>
      }
    >
      <div className="relative h-36 overflow-hidden rounded-lg border border-line bg-[#050a10]">
        <Waveform
          peaks={waveform?.peaks ?? []}
          duration={waveformDuration}
          position={position}
          cue={cue}
          bpm={bpm}
          firstBeat={firstBeat}
          enabled={loaded && waveformDuration > 0}
          onSeek={(seconds) => void seek(seconds)}
        />

        {!loaded ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#050a10]/80 px-4 text-center">
            <p className="text-sm font-semibold text-ink">Drag &amp; drop track ke sini</p>
            <p className="text-[11px] text-ink-faint">
              MP3 · FLAC · WAV · OGG · AAC/M4A · AIFF · ALAC
            </p>
            <button
              type="button"
              className="btn btn-primary pointer-events-auto mt-1 px-3 py-1.5 text-xs"
              onClick={() => void chooseFile()}
              disabled={loading}
            >
              {loading ? "Memuat…" : "Pilih file audio"}
            </button>
          </div>
        ) : null}

        {loaded && !waveform ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35">
            <span className="chip border-cyan/30 text-cyan-soft">
              Menganalisis waveform…
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
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
        />
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: 8 }).map((_, slot) => {
              const cuePos = hotCues[slot] ?? null;
              const colors = [
                "#22d3ee",
                "#f472b6",
                "#fbbf24",
                "#a78bfa",
                "#34d399",
                "#fb7185",
                "#60a5fa",
                "#f97316",
              ];
              const color = colors[slot % colors.length];
              return (
                <button
                  key={slot}
                  type="button"
                  className="flex min-h-[34px] flex-col items-center justify-center rounded border px-1 py-0.5 text-[9px] leading-tight"
                  style={{
                    borderColor: color,
                    backgroundColor: cuePos != null ? `${color}22` : "transparent",
                    color: cuePos != null ? color : "#94a3b8",
                  }}
                  onClick={(event) => {
                    if (event.shiftKey || cuePos == null) {
                      void setHotCueHere(slot);
                    } else {
                      void triggerHotCue(slot);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (cuePos != null) {
                      void clearHotCue(slot);
                    }
                  }}
                  disabled={!loaded}
                  title={`Hot cue ${slot + 1}: klik set/lompat, klik kanan hapus`}
                >
                  <span className="font-bold">{slot + 1}</span>
                  <span className="readout text-[8px]">
                    {cuePos != null ? formatTime(cuePos) : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-line bg-deck-850/60 p-2">
              <div className="flex items-center justify-between gap-1">
                <span className="field-label">Loop</span>
                <span className="chip text-[9px]">
                  {status?.loopActive ? `${status.loopBeats || "?"} beat` : "OFF"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <select
                  className="btn h-7 px-1 text-[10px]"
                  value={loopBeats}
                  onChange={(event) => setLoopBeatsState(Number(event.target.value))}
                  disabled={!loaded}
                >
                  {[1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value < 1 ? `1/${1 / value}` : value} beat
                      </option>
                    ),
                  )}
                </select>
                <button
                  type="button"
                  className="btn btn-primary px-2 py-1 text-[10px]"
                  onClick={() => void startLoop(loopBeats)}
                  disabled={!loaded || !bpmKnown}
                >
                  LOOP
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-[10px]"
                  onClick={() => void exitLoop()}
                  disabled={!loaded || !status?.loopActive}
                >
                  EXIT
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="btn px-2 py-1 text-[10px]"
                  onClick={() => void halveLoop()}
                  disabled={!status?.loopActive}
                >
                  ½
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-[10px]"
                  onClick={() => void doubleLoop()}
                  disabled={!status?.loopActive}
                >
                  ×2
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-[10px]"
                  onPointerDown={() => {
                    if (loopBeats > 0) void startLoop(loopBeats);
                  }}
                  onPointerUp={() => void exitLoop()}
                  onPointerLeave={() => void exitLoop()}
                  disabled={!loaded || !bpmKnown}
                >
                  ROLL
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-[10px]"
                  onClick={() => void manualLoopIn()}
                  disabled={!loaded}
                  title="Set loop in di posisi saat ini"
                >
                  IN
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-[10px]"
                  onClick={() => void manualLoopOut()}
                  disabled={!loaded || pendingLoopIn == null}
                  title="Set loop out di posisi saat ini"
                >
                  OUT
                </button>
              </div>
            </div>

            <div className="rounded border border-line bg-deck-850/60 p-2">
              <span className="field-label">Beat jump</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {[-8, -4, -1, 1, 4, 8].map((beats) => (
                  <button
                    key={beats}
                    type="button"
                    className="btn px-2 py-1 text-[10px]"
                    onClick={() => void beatJump(beats)}
                    disabled={!loaded || !bpmKnown}
                  >
                    {beats > 0 ? `+${beats}` : beats}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  className="btn w-full py-1 text-[10px]"
                  onClick={() => void syncToOther()}
                  disabled={!loaded || !bpmKnown}
                  title="Sinkronkan BPM dan fase ke deck lain"
                >
                  SYNC
                </button>
              </div>
              <p className="mt-1 text-[9px] text-ink-faint">
                {pendingLoopIn != null
                  ? `loop in ${formatTime(pendingLoopIn)}`
                  : status?.loopActive
                    ? `${formatTime(status.loopStartSecs)} → ${formatTime(status.loopEndSecs)}`
                    : "Beat jump mengikuti BPM aktif."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {status?.codec ? <span className="chip">{status.codec}</span> : null}
            {status?.sourceSampleRate ? (
              <span className="chip">
                {formatSampleRate(status.sourceSampleRate)} →{" "}
                {formatSampleRate(status.engineSampleRate)}
              </span>
            ) : null}
            {status?.channels ? <span className="chip">{status.channels} ch</span> : null}
            {status?.sourceSampleRate ? (
              <span className="chip">{status.engineSampleRate} Hz engine</span>
            ) : null}
          </div>
          <h3 className="mt-1.5 truncate font-display text-xl text-ink">
            {status?.fileName ?? "Belum ada track dimuat"}
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {loaded
              ? `Buffer ${formatInt(Math.round(status?.bufferedMs ?? 0))} ms · underrun ${formatInt(
                  status?.underruns ?? 0,
                )} · cue ${formatTime(cue)}`
              : "Tekan Space untuk play/pause setelah track dimuat."}
          </p>
        </div>

        <div className="text-right">
          <div className="readout text-2xl text-cyan-soft">{formatTime(position)}</div>
          <div className="readout mt-0.5 text-[11px] text-ink-faint">
            sisa −{formatTime(remaining)} · total {formatTime(duration)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="btn btn-danger h-14 text-sm tracking-[0.14em]"
          onClick={() => void cueJump()}
          disabled={!loaded || busy}
          title="Kembali ke cue point dan pause (gaya CDJ)"
        >
          CUE
        </button>
        <button
          type="button"
          className={`btn h-14 text-base tracking-[0.14em] ${playing ? "" : "btn-primary"}`}
          onClick={() => void toggle()}
          disabled={!loaded || busy}
          aria-pressed={playing}
        >
          {playing ? "PAUSE" : "PLAY"}
        </button>
        <button
          type="button"
          className="btn h-14 text-sm tracking-[0.14em]"
          onClick={() => void setCue()}
          disabled={!loaded || busy}
          title="Simpan posisi saat ini sebagai cue point"
        >
          SET CUE
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="btn text-xs"
          onClick={() => void seek(position - 10)}
          disabled={!loaded}
        >
          −10 s
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => void seek(position + 10)}
          disabled={!loaded}
        >
          +10 s
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => void unload()}
          disabled={!loaded || busy}
        >
          Unload
        </button>
      </div>

      <div className="mt-4">
        <Slider
          id="deck-gain"
          label="Deck gain"
          value={gainDb}
          min={-60}
          max={12}
          step={0.5}
          onChange={(value) => void setGainDb(value)}
          display={formatDb(gainDb)}
          disabled={!loaded}
          hint="Double-click untuk kembali ke 0 dB."
          onReset={() => void setGainDb(0)}
        />
      </div>

      <div className="mt-4 rounded-lg border border-line bg-deck-850/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label">Tempo &amp; key</span>
          <div className="flex gap-1" role="group" aria-label="Rentang pitch fader">
            {[8, 16, 50].map((range) => (
              <button
                key={range}
                type="button"
                className={`btn px-2 py-1 text-[11px] ${
                  pitchRange === range ? "btn-primary" : ""
                }`}
                onClick={() => void setPitchRange(range)}
                disabled={!loaded}
                aria-pressed={pitchRange === range}
                title={`Batas pitch ±${range}%`}
              >
                ±{range}%
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2">
          <Slider
            id="deck-speed"
            label="Pitch fader"
            value={speed}
            min={minSpeed}
            max={maxSpeed}
            step={0.001}
            onChange={(value) => void setSpeed(value)}
            display={formatPitchPercent(speed)}
            disabled={!loaded}
            hint={
              keylock
                ? "Key lock: tempo berubah, pitch tetap."
                : "Turntable: tempo dan pitch berubah bersama."
            }
            onReset={() => void setSpeed(1)}
          />
        </div>

        <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
          <button
            type="button"
            className={`btn px-3 py-2 text-[11px] tracking-[0.12em] ${
              keylock ? "btn-primary" : ""
            }`}
            onClick={() => void setKeylock(!keylock)}
            disabled={!loaded}
            aria-pressed={keylock}
            title="Master tempo / key lock: ubah tempo tanpa mengubah nada"
          >
            KEY LOCK
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn h-9 w-9 px-0 text-base"
              onClick={() => void setSemitones(semitones - 1)}
              disabled={!loaded || !keylock}
              aria-label="Turunkan keyshift satu semitone"
            >
              −
            </button>
            <span className="readout flex-1 text-center text-sm text-ink">
              {formatSemitones(semitones)}
            </span>
            <button
              type="button"
              className="btn h-9 w-9 px-0 text-base"
              onClick={() => void setSemitones(semitones + 1)}
              disabled={!loaded || !keylock}
              aria-label="Naikkan keyshift satu semitone"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-deck-850/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="field-label">BPM</p>
              <p className="readout text-lg text-cyan-soft">{formatBpm(bpm)}</p>
              <p className="text-[10px] text-ink-faint">
                {effectiveBpm > 0
                  ? `efektif ${effectiveBpm.toFixed(2)}`
                  : detectedBpm > 0
                    ? "belum ada tempo"
                    : "belum terdeteksi"}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn px-2 py-1 text-[11px]"
                onClick={() => void setBpm(bpm / 2)}
                disabled={!loaded || !bpmKnown}
                title="Setengah BPM (beat grid lebih rapat)"
              >
                ÷2
              </button>
              <button
                type="button"
                className="btn px-2 py-1 text-[11px]"
                onClick={() => void setBpm(bpm * 2)}
                disabled={!loaded || !bpmKnown}
                title="Dua kali BPM (beat grid lebih renggang)"
              >
                ×2
              </button>
              <button
                type="button"
                className="btn px-2 py-1 text-[11px]"
                onClick={() => void tapTempo()}
                disabled={!loaded}
                title="Tap beberapa kali mengikuti beat untuk mengoreksi BPM"
              >
                TAP
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-deck-850/60 p-3">
          <p className="field-label">Key</p>
          <p className="readout text-lg text-magenta">
            {camelot ?? "—"}{" "}
            <span className="font-sans text-xs text-ink-dim">{keyName ?? "belum terdeteksi"}</span>
          </p>
          <p className="text-[10px] text-ink-faint">
            {status?.analysisReady
              ? `beat 1 ${formatTime(firstBeat)} · Camelot / Open Key`
              : "Menganalisis BPM, key, dan beatgrid…"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <LevelMeter peak={status?.peak ?? 0} channelLabels={["A L", "A R"]} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1">
          <div>
            <dt className="field-label">Posisi cue</dt>
            <dd className="readout text-[13px] text-ink">{formatTime(cue)}</dd>
          </div>
          <div>
            <dt className="field-label">Buffer</dt>
            <dd className="readout text-[13px] text-ink">
              {formatMs(status?.bufferedMs)}
            </dd>
          </div>
          <div>
            <dt className="field-label">Waveform</dt>
            <dd className="readout text-[13px] text-ink">
              {status?.waveformReady ? "Siap" : loaded ? "Menganalisis" : "—"}
            </dd>
          </div>
        </dl>
      </div>

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

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Time-stretch WSOLA membuat pitch fader berjalan dengan key lock. BPM,
        key Camelot, dan garis beatgrid berasal dari analisis FFT di background.            Hot cue: Shift+klik/klik pad kosong = set, klik pad terisi = lompat, klik kanan = hapus. Sync ke deck lain tersedia.

      </p>
    </Panel>
  );
}
