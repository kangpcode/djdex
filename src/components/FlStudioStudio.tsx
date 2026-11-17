import { useEffect, useRef, useState } from "react";
import {
  FL_STUDIO_PRESETS,
  synthEngine,
  type BeatPattern,
  type InstrumentType,
} from "../lib/synthEngine";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { useSamplerStore } from "../stores/samplerStore";
import { Knob3D } from "./ui/Knob3D";
import {
  IconClose,
  IconDrum,
  IconExport,
  IconLoop,
  IconPiano,
  IconPlay,
  IconSliders,
  IconStop,
} from "./ui/Icons";

const INSTRUMENT_OPTIONS: Array<{ id: InstrumentType; label: string; desc: string }> = [
  { id: "piano", label: "Acoustic Grand Piano", desc: "Suara tuts piano akustik kaya resonansi dan hammer transient" },
  { id: "rhodes", label: "Electric Piano (Rhodes)", desc: "Warm bell chime electric piano khas neo-soul & deep house" },
  { id: "lead", label: "EDM Supersaw Lead", desc: "Detuned saw festival punchy khas Avicii & Martin Garrix" },
  { id: "bass", label: "808 Sub Bass", desc: "Low-end 40-80 Hz punchy bassline untuk hip hop & tech house" },
  { id: "organ", label: "Club House Organ", desc: "90s Korg M1 house organ klasik bernuansa garage / rave" },
  { id: "pluck", label: "Pluck Synth", desc: "Percussive synth pluck pendek untuk progressive house" },
  { id: "strings", label: "Ambient Synth Strings", desc: "Pad synth atmosferik dengan slow attack stereo" },
];

const CHORD_PRESETS: Array<{ name: string; notes: number[] }> = [
  { name: "Am", notes: [57, 60, 64] },
  { name: "F", notes: [53, 57, 60] },
  { name: "C", notes: [60, 64, 67] },
  { name: "G", notes: [55, 59, 62] },
  { name: "Dm", notes: [50, 53, 57] },
  { name: "Em", notes: [52, 55, 59] },
  { name: "Bb", notes: [58, 62, 65] },
  { name: "D", notes: [50, 54, 57] },
];

// Peta keyboard komputer (QWERTY) ke nada piano (2 oktaf)
const KEYBOARD_MAP: Record<string, number> = {
  a: 0, // C
  w: 1, // C#
  s: 2, // D
  e: 3, // D#
  d: 4, // E
  f: 5, // F
  t: 6, // F#
  g: 7, // G
  y: 8, // G#
  h: 9, // A
  u: 10, // A#
  j: 11, // B
  k: 12, // C (High)
  o: 13, // C# (High)
  l: 14, // D (High)
  p: 15, // D# (High)
  ";": 16, // E (High)
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function FlStudioStudio() {
  const [subTab, setSubTab] = useState<"piano" | "sequencer" | "fx">("piano");
  const [instrument, setInstrument] = useState<InstrumentType>("piano");
  const [baseOctave, setBaseOctave] = useState<number>(4); // Oktaf 4 (C4 = 60)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  // Sequencer State
  const [pattern, setPattern] = useState<BeatPattern>(FL_STUDIO_PRESETS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [bpm, setBpm] = useState<number>(pattern.bpm);
  const [selectedMelodyNote, setSelectedMelodyNote] = useState<number>(60);
  const [selectedBassNote, setSelectedBassNote] = useState<number>(36);
  const [targetPad, setTargetPad] = useState<number>(0);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // FX State
  const [reverbSize, setReverbSize] = useState<number>(0.6);
  const [reverbWet, setReverbWet] = useState<number>(0.3);
  const [delayTime, setDelayTime] = useState<number>(0.375);
  const [delayFeedback, setDelayFeedback] = useState<number>(0.4);
  const [delayWet, setDelayWet] = useState<number>(0.25);
  const [filterCutoff, setFilterCutoff] = useState<number>(18000);
  const [filterRes, setFilterRes] = useState<number>(1.0);
  const [distortionDrive, setDistortionDrive] = useState<number>(0.2);
  const [masterVol, setMasterVol] = useState<number>(0.9);

  const seqTimerRef = useRef<number | null>(null);
  const stepRef = useRef<number>(0);

  // Zustand Store
  const loadDeckA = useDeckAStore((s) => s.load);
  const loadDeckB = useDeckBStore((s) => s.load);
  const updatePad = useSamplerStore((s) => s.updatePad);

  // Sinkronisasi FX saat parameter berubah
  useEffect(() => {
    synthEngine.updateFx({
      masterVolume: masterVol,
      reverb: { enabled: reverbWet > 0.01, size: reverbSize, wet: reverbWet },
      delay: { enabled: delayWet > 0.01, timeSecs: delayTime, feedback: delayFeedback, wet: delayWet },
      filter: { enabled: filterCutoff < 17500, cutoff: filterCutoff, resonance: filterRes, type: "lowpass" },
      distortion: { enabled: distortionDrive > 0.02, drive: distortionDrive },
    });
  }, [masterVol, reverbSize, reverbWet, delayTime, delayFeedback, delayWet, filterCutoff, filterRes, distortionDrive]);

  // Handler keyboard komputer PC untuk tuts piano
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      const semitone = KEYBOARD_MAP[key];
      if (semitone !== undefined) {
        const midi = baseOctave * 12 + semitone;
        if (!activeNotes.has(midi)) {
          synthEngine.noteOn(midi, 0.9, instrument);
          setActiveNotes((prev) => new Set(prev).add(midi));
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      const semitone = KEYBOARD_MAP[key];
      if (semitone !== undefined) {
        const midi = baseOctave * 12 + semitone;
        synthEngine.noteOff(midi);
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.delete(midi);
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [baseOctave, instrument, activeNotes]);

  // Sequencer Web Audio Clock Loop
  useEffect(() => {
    if (!isPlaying) {
      if (seqTimerRef.current !== null) {
        window.clearInterval(seqTimerRef.current);
        seqTimerRef.current = null;
      }
      return;
    }

    const stepIntervalMs = (60 / bpm / 4) * 1000;
    seqTimerRef.current = window.setInterval(() => {
      const s = stepRef.current;
      setCurrentStep(s);

      // Trigger instrumen drum
      if (pattern.tracks.kick[s]) synthEngine.playDrum("kick", 0.95);
      if (pattern.tracks.snare[s]) synthEngine.playDrum("snare", 0.9);
      if (pattern.tracks.clap[s]) synthEngine.playDrum("clap", 0.85);
      if (pattern.tracks.hihat_closed[s]) synthEngine.playDrum("hihat_closed", 0.75);
      if (pattern.tracks.hihat_open[s]) synthEngine.playDrum("hihat_open", 0.8);

      // Trigger Bass
      const bass = pattern.tracks.bass[s];
      if (bass?.active) {
        synthEngine.noteOn(bass.note, 0.9, "bass");
      }

      // Trigger Melody
      const mel = pattern.tracks.melody[s];
      if (mel?.active) {
        synthEngine.noteOn(mel.note, 0.9, pattern.instrument);
      }

      stepRef.current = (s + 1) % 16;
    }, stepIntervalMs);

    return () => {
      if (seqTimerRef.current !== null) {
        window.clearInterval(seqTimerRef.current);
        seqTimerRef.current = null;
      }
    };
  }, [isPlaying, bpm, pattern]);

  const handleNoteDown = (midi: number) => {
    synthEngine.noteOn(midi, 0.9, instrument);
    setActiveNotes((prev) => new Set(prev).add(midi));
  };

  const handleNoteUp = (midi: number) => {
    synthEngine.noteOff(midi);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  };

  const handlePlayChord = (notes: number[]) => {
    notes.forEach((n) => synthEngine.noteOn(n, 0.85, instrument));
    setTimeout(() => {
      notes.forEach((n) => synthEngine.noteOff(n));
    }, 900);
  };

  const toggleDrumStep = (track: keyof BeatPattern["tracks"], step: number) => {
    setPattern((prev) => {
      const trackArray = [...(prev.tracks[track] as boolean[])];
      trackArray[step] = !trackArray[step];
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [track]: trackArray,
        },
      };
    });
  };

  const toggleMelodyStep = (step: number) => {
    setPattern((prev) => {
      const mel = [...prev.tracks.melody];
      const current = mel[step];
      mel[step] = {
        active: !current?.active,
        note: selectedMelodyNote,
      };
      return {
        ...prev,
        tracks: { ...prev.tracks, melody: mel },
      };
    });
  };

  const toggleBassStep = (step: number) => {
    setPattern((prev) => {
      const b = [...prev.tracks.bass];
      const current = b[step];
      b[step] = {
        active: !current?.active,
        note: selectedBassNote,
      };
      return {
        ...prev,
        tracks: { ...prev.tracks, bass: b },
      };
    });
  };

  // Render & Export WAV ke Sampler Pad atau Deck
  const handleExportToWav = async (target: "download" | "pad" | "deckA" | "deckB") => {
    try {
      setExportNotice("Merender loop audio WAV 44.1kHz...");
      const blob = await synthEngine.renderPatternToWavBlob(pattern, 2);
      const url = URL.createObjectURL(blob);

      if (target === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `djdex_beat_${pattern.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.wav`;
        a.click();
        setExportNotice("File WAV berhasil diunduh ke komputer!");
      } else if (target === "pad") {
        // Konfigurasi mode loop pada pad tujuan
        void updatePad(targetPad, {
          name: pattern.name.split(" ")[0] + " Beat",
          mode: "loop",
          volume: 1.0,
          syncBpm: true,
          baseBpm: pattern.bpm,
        });
        setExportNotice(`Beat berhasil dikirim ke Sampler Pad ${(targetPad + 1).toString().padStart(2, "0")} dengan mode LOOP aktif!`);
      } else if (target === "deckA") {
        void loadDeckA(url);
        setExportNotice("Beat berhasil dimuat ke Deck A untuk mixing DJ!");
      } else if (target === "deckB") {
        void loadDeckB(url);
        setExportNotice("Beat berhasil dimuat ke Deck B untuk mixing DJ!");
      }

      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      setExportNotice(`Gagal merender loop: ${String(err)}`);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl bg-[#070b14] border border-[#1a2538] shadow-2xl">
      {/* Header Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#182335]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-fuchsia-500 shadow-[0_0_10px_#d946ef] animate-pulse" />
            <h2 className="font-display text-sm font-black tracking-widest text-slate-100 uppercase">
              FL Studio Beat Maker &amp; Virtual Piano Synthesizer
            </h2>
          </div>
          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-[#101827] border border-[#1f2d42] text-fuchsia-400 font-bold">
            64-Bit Polyphonic DSP
          </span>
        </div>

        {/* Tab Sub-View Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#05080f] border border-[#162130]">
          <button
            type="button"
            onClick={() => setSubTab("piano")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
              subTab === "piano"
                ? "bg-fuchsia-500/25 border border-fuchsia-400 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.3)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <IconPiano className="w-3.5 h-3.5" />
            Virtual Piano &amp; Synth
          </button>

          <button
            type="button"
            onClick={() => setSubTab("sequencer")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
              subTab === "sequencer"
                ? "bg-cyan-500/25 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <IconDrum className="w-3.5 h-3.5" />
            Step Sequencer Beat Maker
          </button>

          <button
            type="button"
            onClick={() => setSubTab("fx")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
              subTab === "fx"
                ? "bg-amber-500/25 border border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <IconSliders className="w-3.5 h-3.5" />
            Studio FX Rack
          </button>
        </div>
      </div>

      {/* Export / Notification Toast */}
      {exportNotice && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-mono">
          <span>{exportNotice}</span>
          <button type="button" onClick={() => setExportNotice(null)}>
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 1: VIRTUAL PIANO KEYBOARD & MULTI-INSTRUMENT */}
      {subTab === "piano" && (
        <div className="flex flex-col gap-4">
          {/* Controls Bar: Instrument Selector & Octave */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            {/* Instrument Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                INSTRUMEN:
              </span>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentType)}
                className="bg-[#05080f] border border-[#233348] text-slate-100 text-xs font-bold rounded px-3 py-1.5 focus:border-fuchsia-400 focus:outline-none"
              >
                {INSTRUMENT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Octave Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mr-1">
                OKTAF:
              </span>
              {[2, 3, 4, 5, 6].map((oct) => (
                <button
                  key={oct}
                  type="button"
                  onClick={() => setBaseOctave(oct)}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all ${
                    baseOctave === oct
                      ? "bg-fuchsia-500/30 border border-fuchsia-400 text-fuchsia-300 shadow-[0_0_8px_rgba(217,70,239,0.4)]"
                      : "bg-[#0c121e] border border-[#1b2738] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  C{oct}
                </button>
              ))}
            </div>

            {/* Quick Chord Assistant Bar */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mr-1">
                CHORDS:
              </span>
              {CHORD_PRESETS.map((ch) => (
                <button
                  key={ch.name}
                  type="button"
                  onClick={() => handlePlayChord(ch.notes)}
                  className="px-2 py-1 text-[10px] font-mono font-bold rounded bg-[#0c121e] border border-[#202d40] text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 active:scale-95 transition"
                  title={`Mainkan Chord ${ch.name}`}
                >
                  {ch.name}
                </button>
              ))}
            </div>
          </div>

          {/* SKEUOMORPHIC 3D PIANO KEYBOARD (2 FULL OCTAVES: 24 KEYS) */}
          <div className="relative flex justify-center p-4 rounded-xl bg-gradient-to-b from-[#0a0f1c] to-[#04060a] border border-[#1c293c] shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_12px_30px_rgba(0,0,0,0.8)] overflow-x-auto select-none">
            <div className="relative flex items-start">
              {/* White Keys */}
              {Array.from({ length: 14 }).map((_, wIdx) => {
                // Konversi urutan tuts putih ke MIDI note
                const whiteIntervals = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
                const semitone = whiteIntervals[wIdx];
                const midiNote = baseOctave * 12 + semitone;
                const isPressed = activeNotes.has(midiNote);
                const noteName = NOTE_NAMES[midiNote % 12];
                const octNum = Math.floor(midiNote / 12) - 1;

                return (
                  <button
                    key={midiNote}
                    type="button"
                    onPointerDown={() => handleNoteDown(midiNote)}
                    onPointerUp={() => handleNoteUp(midiNote)}
                    onPointerLeave={() => handleNoteUp(midiNote)}
                    className={`relative w-12 sm:w-14 h-48 rounded-b-md border border-[#182334] flex flex-col justify-end items-center pb-2 transition-all ${
                      isPressed
                        ? "bg-fuchsia-200 border-fuchsia-500 shadow-[inset_0_4px_8px_rgba(0,0,0,0.4),0_0_12px_rgba(217,70,239,0.6)] translate-y-1"
                        : "bg-gradient-to-b from-[#e2e8f0] via-[#cbd5e1] to-[#f8fafc] shadow-[inset_0_1px_0_#fff,0_6px_8px_rgba(0,0,0,0.6)] hover:bg-slate-100"
                    }`}
                  >
                    <span className="font-mono text-[9px] font-black text-slate-800">
                      {noteName}{octNum}
                    </span>
                  </button>
                );
              })}

              {/* Black Keys (Ebony) */}
              {/* Posisi tuts hitam di atas tuts putih: C#, D#, F#, G#, A# pada 2 oktaf */}
              {[
                { offset: 1, midi: baseOctave * 12 + 1 }, // C#
                { offset: 2, midi: baseOctave * 12 + 3 }, // D#
                { offset: 4, midi: baseOctave * 12 + 6 }, // F#
                { offset: 5, midi: baseOctave * 12 + 8 }, // G#
                { offset: 6, midi: baseOctave * 12 + 10 }, // A#
                { offset: 8, midi: baseOctave * 12 + 13 }, // C# (Oct + 1)
                { offset: 9, midi: baseOctave * 12 + 15 }, // D# (Oct + 1)
                { offset: 11, midi: baseOctave * 12 + 18 }, // F# (Oct + 1)
                { offset: 12, midi: baseOctave * 12 + 20 }, // G# (Oct + 1)
                { offset: 13, midi: baseOctave * 12 + 22 }, // A# (Oct + 1)
              ].map(({ offset, midi }) => {
                const isPressed = activeNotes.has(midi);
                const noteName = NOTE_NAMES[midi % 12];

                return (
                  <button
                    key={midi}
                    type="button"
                    onPointerDown={() => handleNoteDown(midi)}
                    onPointerUp={() => handleNoteUp(midi)}
                    onPointerLeave={() => handleNoteUp(midi)}
                    className={`absolute z-10 w-7 sm:w-8 h-28 rounded-b border border-black flex flex-col justify-end items-center pb-1.5 transition-all ${
                      isPressed
                        ? "bg-fuchsia-700 border-fuchsia-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_0_15px_rgba(217,70,239,0.8)] translate-y-1"
                        : "bg-gradient-to-b from-[#1e293b] via-[#0f172a] to-[#020617] shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_6px_10px_rgba(0,0,0,0.9)] hover:bg-[#111827]"
                    }`}
                    style={{
                      left: `calc(${offset} * 3rem - 0.9rem)`,
                    }}
                  >
                    <span className="font-mono text-[8px] font-bold text-slate-300">
                      {noteName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-center font-mono text-[10.5px] text-slate-400">
            Tip: Kamu bisa memainkan nada langsung dari keyboard fisik PC: <span className="text-cyan-300 font-bold">A, S, D, F, G, H, J, K</span> (Tuts Putih) dan <span className="text-pink-300 font-bold">W, E, T, Y, U, O</span> (Tuts Hitam).
          </p>
        </div>
      )}

      {/* TAB 2: FL STUDIO STEP SEQUENCER & BEAT MAKER (BUAT MUSIK DARI NOL) */}
      {subTab === "sequencer" && (
        <div className="flex flex-col gap-3">
          {/* Top Bar: Preset Selector, Play/Stop, BPM, Swing */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#080d17] border border-[#1c293c]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-display text-xs font-black tracking-widest transition-all ${
                  isPlaying
                    ? "bg-red-500/25 border border-red-500 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                    : "bg-emerald-500/25 border border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                }`}
              >
                {isPlaying ? <IconStop className="w-4 h-4" /> : <IconPlay className="w-4 h-4" />}
                {isPlaying ? "STOP SEQUENCER" : "START BEAT"}
              </button>

              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">PRESET:</span>
                <select
                  value={pattern.name}
                  onChange={(e) => {
                    const found = FL_STUDIO_PRESETS.find((p) => p.name === e.target.value);
                    if (found) {
                      setPattern(found);
                      setBpm(found.bpm);
                    }
                  }}
                  className="bg-[#0c121e] border border-[#223146] text-slate-200 text-xs font-bold rounded px-2.5 py-1.5 focus:border-cyan-400 focus:outline-none"
                >
                  {FL_STUDIO_PRESETS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* BPM & Swing Controls */}
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase">TEMPO:</span>
                <input
                  type="number"
                  min={40}
                  max={220}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-center font-bold text-cyan-300 bg-[#05080e] border border-[#202e42] rounded"
                />
                <span className="text-slate-400 font-bold">BPM</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase">SWING:</span>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={pattern.swing}
                  onChange={(e) => setPattern((prev) => ({ ...prev, swing: Number(e.target.value) }))}
                  className="w-20 accent-fuchsia-400 cursor-pointer"
                />
                <span className="text-slate-400">{Math.round(pattern.swing * 100)}%</span>
              </div>
            </div>
          </div>

          {/* 16-Step Grid Tracks Matrix (FL Studio 4-Group Blocks) */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#05080f] border border-[#162130]">
            {/* Step Indicators Header */}
            <div className="flex items-center gap-2 pb-1 border-b border-[#141c28]">
              <span className="w-28 text-[9px] font-mono font-bold text-slate-400 uppercase">TRACKS</span>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {Array.from({ length: 16 }).map((_, step) => (
                  <span
                    key={step}
                    className={`text-center font-mono text-[9px] font-bold ${
                      currentStep === step && isPlaying
                        ? "text-cyan-300"
                        : step % 4 === 0
                        ? "text-slate-200"
                        : "text-slate-500"
                    }`}
                  >
                    {step + 1}
                  </span>
                ))}
              </div>
            </div>

            {/* 1. Kick Drum Track */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => synthEngine.playDrum("kick")}
                className="w-28 py-1.5 px-2 rounded text-left font-display text-xs font-bold bg-[#0d1422] border border-[#202e42] text-cyan-300 hover:border-cyan-400 truncate"
              >
                1. KICK DRUM
              </button>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.kick.map((active, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleDrumStep("kick", step)}
                      className={`h-8 rounded border transition-all ${
                        isCurrent ? "ring-2 ring-cyan-300 scale-105" : ""
                      } ${
                        active
                          ? "bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538]"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 2. Snare Drum Track */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => synthEngine.playDrum("snare")}
                className="w-28 py-1.5 px-2 rounded text-left font-display text-xs font-bold bg-[#0d1422] border border-[#202e42] text-fuchsia-300 hover:border-fuchsia-400 truncate"
              >
                2. SNARE
              </button>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.snare.map((active, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleDrumStep("snare", step)}
                      className={`h-8 rounded border transition-all ${
                        isCurrent ? "ring-2 ring-fuchsia-300 scale-105" : ""
                      } ${
                        active
                          ? "bg-fuchsia-400 border-fuchsia-300 shadow-[0_0_8px_rgba(217,70,239,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538]"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 3. Hand Clap Track */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => synthEngine.playDrum("clap")}
                className="w-28 py-1.5 px-2 rounded text-left font-display text-xs font-bold bg-[#0d1422] border border-[#202e42] text-amber-300 hover:border-amber-400 truncate"
              >
                3. CLAP
              </button>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.clap.map((active, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleDrumStep("clap", step)}
                      className={`h-8 rounded border transition-all ${
                        isCurrent ? "ring-2 ring-amber-300 scale-105" : ""
                      } ${
                        active
                          ? "bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538]"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 4. Closed Hi-Hat Track */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => synthEngine.playDrum("hihat_closed")}
                className="w-28 py-1.5 px-2 rounded text-left font-display text-xs font-bold bg-[#0d1422] border border-[#202e42] text-emerald-300 hover:border-emerald-400 truncate"
              >
                4. CLOSED HAT
              </button>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.hihat_closed.map((active, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleDrumStep("hihat_closed", step)}
                      className={`h-8 rounded border transition-all ${
                        isCurrent ? "ring-2 ring-emerald-300 scale-105" : ""
                      } ${
                        active
                          ? "bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538]"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 5. Open Hi-Hat Track */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => synthEngine.playDrum("hihat_open")}
                className="w-28 py-1.5 px-2 rounded text-left font-display text-xs font-bold bg-[#0d1422] border border-[#202e42] text-teal-300 hover:border-teal-400 truncate"
              >
                5. OPEN HAT
              </button>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.hihat_open.map((active, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleDrumStep("hihat_open", step)}
                      className={`h-8 rounded border transition-all ${
                        isCurrent ? "ring-2 ring-teal-300 scale-105" : ""
                      } ${
                        active
                          ? "bg-teal-400 border-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538]"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 6. 808 Sub Bassline Track */}
            <div className="flex items-center gap-2 pt-1 border-t border-[#141d2c]">
              <div className="w-28 flex flex-col">
                <span className="font-display text-[11px] font-bold text-rose-300">6. 808 BASS</span>
                <select
                  value={selectedBassNote}
                  onChange={(e) => setSelectedBassNote(Number(e.target.value))}
                  className="bg-[#0c121e] border border-[#1e2a3c] text-[9.5px] font-mono text-rose-300 rounded px-1 py-0.5 mt-0.5"
                >
                  {[33, 34, 36, 38, 39, 41, 43, 45].map((n) => (
                    <option key={n} value={n}>
                      {NOTE_NAMES[n % 12]}{Math.floor(n / 12) - 1} ({n})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.bass.map((stepData, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleBassStep(step)}
                      className={`h-8 rounded border transition-all flex items-center justify-center font-mono text-[8px] font-bold ${
                        isCurrent ? "ring-2 ring-rose-400 scale-105" : ""
                      } ${
                        stepData.active
                          ? "bg-rose-500 border-rose-400 text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538] text-slate-500"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c] text-slate-600"
                      }`}
                    >
                      {stepData.active ? NOTE_NAMES[stepData.note % 12] : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 7. Piano / Melodic Synth Track */}
            <div className="flex items-center gap-2">
              <div className="w-28 flex flex-col">
                <span className="font-display text-[11px] font-bold text-violet-300">7. PIANO / LEAD</span>
                <select
                  value={selectedMelodyNote}
                  onChange={(e) => setSelectedMelodyNote(Number(e.target.value))}
                  className="bg-[#0c121e] border border-[#1e2a3c] text-[9.5px] font-mono text-violet-300 rounded px-1 py-0.5 mt-0.5"
                >
                  {[57, 58, 60, 62, 63, 65, 67, 69, 70, 72].map((n) => (
                    <option key={n} value={n}>
                      {NOTE_NAMES[n % 12]}{Math.floor(n / 12) - 1} ({n})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {pattern.tracks.melody.map((stepData, step) => {
                  const isCurrent = currentStep === step && isPlaying;
                  const isBeatLead = Math.floor(step / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleMelodyStep(step)}
                      className={`h-8 rounded border transition-all flex items-center justify-center font-mono text-[8px] font-bold ${
                        isCurrent ? "ring-2 ring-violet-400 scale-105" : ""
                      } ${
                        stepData.active
                          ? "bg-violet-500 border-violet-400 text-white shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                          : isBeatLead
                          ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538] text-slate-500"
                          : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c] text-slate-600"
                      }`}
                    >
                      {stepData.active ? NOTE_NAMES[stepData.note % 12] : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export & DJ Integration Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                TARGET SAMPLER PAD:
              </span>
              <select
                value={targetPad}
                onChange={(e) => setTargetPad(Number(e.target.value))}
                className="bg-[#05080e] border border-[#202e42] text-xs font-mono font-bold text-cyan-300 rounded px-2 py-1"
              >
                {Array.from({ length: 16 }).map((_, idx) => (
                  <option key={idx} value={idx}>
                    Pad {(idx + 1).toString().padStart(2, "0")}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void handleExportToWav("pad")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold font-mono bg-cyan-500/20 border border-cyan-400 text-cyan-300 rounded hover:bg-cyan-500/30 transition shadow-sm"
              >
                <IconLoop className="w-3.5 h-3.5" />
                KIRIM KE SAMPLER (LOOP)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportToWav("deckA")}
                className="px-2.5 py-1 text-xs font-bold font-mono bg-[#0e1624] border border-cyan-500/40 text-cyan-300 rounded hover:bg-cyan-500/20 transition"
              >
                Muat ke Deck A
              </button>
              <button
                type="button"
                onClick={() => void handleExportToWav("deckB")}
                className="px-2.5 py-1 text-xs font-bold font-mono bg-[#0e1624] border border-pink-500/40 text-pink-300 rounded hover:bg-pink-500/20 transition"
              >
                Muat ke Deck B
              </button>
              <button
                type="button"
                onClick={() => void handleExportToWav("download")}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold font-mono bg-[#162130] border border-[#26374d] text-slate-200 rounded hover:text-white transition"
              >
                <IconExport className="w-3.5 h-3.5" />
                Download WAV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STUDIO FX RACK */}
      {subTab === "fx" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Reverb */}
          <div className="flex flex-col items-center p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <span className="font-display text-xs font-black text-fuchsia-300 tracking-wider mb-2 uppercase">
              STUDIO REVERB
            </span>
            <div className="flex items-center justify-around w-full py-1">
              <Knob3D
                label="ROOM SIZE"
                size="sm"
                value={reverbSize}
                min={0.1}
                max={2.5}
                step={0.05}
                defaultValue={0.6}
                onChange={setReverbSize}
                display={`${reverbSize.toFixed(1)}s`}
                accentColor="#d946ef"
              />
              <Knob3D
                label="WET / DRY"
                size="sm"
                value={reverbWet}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.3}
                onChange={setReverbWet}
                display={`${Math.round(reverbWet * 100)}%`}
                accentColor="#d946ef"
              />
            </div>
          </div>

          {/* 2. Echo / Delay */}
          <div className="flex flex-col items-center p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <span className="font-display text-xs font-black text-cyan-300 tracking-wider mb-2 uppercase">
              TEMPO DELAY
            </span>
            <div className="flex items-center justify-around w-full py-1">
              <Knob3D
                label="DELAY TIME"
                size="sm"
                value={delayTime}
                min={0.05}
                max={1.0}
                step={0.025}
                defaultValue={0.375}
                onChange={setDelayTime}
                display={`${Math.round(delayTime * 1000)}ms`}
                accentColor="#06b6d4"
              />
              <Knob3D
                label="FEEDBACK"
                size="sm"
                value={delayFeedback}
                min={0}
                max={0.85}
                step={0.05}
                defaultValue={0.4}
                onChange={setDelayFeedback}
                display={`${Math.round(delayFeedback * 100)}%`}
                accentColor="#06b6d4"
              />
              <Knob3D
                label="WET"
                size="sm"
                value={delayWet}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.25}
                onChange={setDelayWet}
                display={`${Math.round(delayWet * 100)}%`}
                accentColor="#06b6d4"
              />
            </div>
          </div>

          {/* 3. Biquad Filter */}
          <div className="flex flex-col items-center p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <span className="font-display text-xs font-black text-amber-300 tracking-wider mb-2 uppercase">
              MASTER FILTER
            </span>
            <div className="flex items-center justify-around w-full py-1">
              <Knob3D
                label="CUTOFF"
                size="sm"
                value={filterCutoff}
                min={200}
                max={20000}
                step={100}
                defaultValue={18000}
                onChange={setFilterCutoff}
                display={filterCutoff >= 1000 ? `${(filterCutoff / 1000).toFixed(1)}k` : `${filterCutoff}Hz`}
                accentColor="#f59e0b"
              />
              <Knob3D
                label="RESONANCE"
                size="sm"
                value={filterRes}
                min={0.5}
                max={8.0}
                step={0.2}
                defaultValue={1.0}
                onChange={setFilterRes}
                display={`Q ${filterRes.toFixed(1)}`}
                accentColor="#f59e0b"
              />
            </div>
          </div>

          {/* 4. Distortion & Master Volume */}
          <div className="flex flex-col items-center p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <span className="font-display text-xs font-black text-rose-300 tracking-wider mb-2 uppercase">
              DRIVE &amp; MASTER
            </span>
            <div className="flex items-center justify-around w-full py-1">
              <Knob3D
                label="WARM DRIVE"
                size="sm"
                value={distortionDrive}
                min={0}
                max={1.0}
                step={0.02}
                defaultValue={0.2}
                onChange={setDistortionDrive}
                display={`${Math.round(distortionDrive * 100)}%`}
                accentColor="#f43f5e"
              />
              <Knob3D
                label="MASTER VOL"
                size="sm"
                value={masterVol}
                min={0}
                max={1.5}
                step={0.05}
                defaultValue={0.9}
                onChange={setMasterVol}
                display={`${Math.round(masterVol * 100)}%`}
                accentColor="#f43f5e"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
