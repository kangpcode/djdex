import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FL_STUDIO_PRESETS,
  MUSICAL_SCALES,
  synthEngine,
  type AllTrackKey,
  type BeatPattern,
  type DrumTrackKey,
  type DrumType,
  type InstrumentType,
  type ScaleDefinition,
  type TrackConfig,
} from "../lib/synthEngine";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { useSamplerStore } from "../stores/samplerStore";
import { Knob3D } from "./ui/Knob3D";
import {
  IconClose,
  IconDrum,
  IconExport,
  IconFlash,
  IconLoop,
  IconPiano,
  IconPlay,
  IconSliders,
  IconStop,
} from "./ui/Icons";

const INSTRUMENT_OPTIONS: Array<{
  id: InstrumentType;
  label: string;
  desc: string;
  category: "Modern" | "Sunda" | "Jawa" | "Japan";
}> = [
  // Modern EDM & Studio
  { id: "piano", label: "Acoustic Grand Piano", desc: "Suara tuts piano akustik kaya resonansi dan hammer transient", category: "Modern" },
  { id: "rhodes", label: "Electric Piano (Rhodes)", desc: "Warm bell chime electric piano khas neo-soul & deep house", category: "Modern" },
  { id: "lead", label: "EDM Supersaw Lead", desc: "Detuned saw festival punchy khas Avicii & Martin Garrix", category: "Modern" },
  { id: "bass", label: "808 Sub Bass", desc: "Low-end 40-80 Hz punchy bassline untuk hip hop & tech house", category: "Modern" },
  { id: "organ", label: "Club House Organ", desc: "90s Korg M1 house organ klasik bernuansa garage / rave", category: "Modern" },
  { id: "pluck", label: "Pluck Synth", desc: "Percussive synth pluck pendek untuk progressive house", category: "Modern" },
  { id: "strings", label: "Ambient Synth Strings", desc: "Pad synth atmosferik dengan slow attack stereo", category: "Modern" },

  // Tradisional Sunda (Jawa Barat)
  { id: "sundanese_suling", label: "Suling Sunda Degung (Bambu)", desc: "Tiupan bambu Sunda dengan microtonal vibrato & nafas syahdu", category: "Sunda" },
  { id: "angklung", label: "Angklung Bambu Sunda (Multi-Pitch)", desc: "Resonansi tabung bambu ganda bergetar khas Jawa Barat", category: "Sunda" },
  { id: "kendang_tuned", label: "Gendang / Kendang (Tuned Pitch)", desc: "Membran kulit gendang bernada untuk melodi bass/riff etnis", category: "Sunda" },

  // Tradisional Jawa
  { id: "gamelan_saron", label: "Gamelan Saron Demung (Jawa)", desc: "Wilahan perunggu tebal dengan overtone inharmonic berkilau", category: "Jawa" },
  { id: "gamelan_gong", label: "Goong & Kempul Gamelan (Tuned)", desc: "Gong perunggu agung beresonansi panjang & shimmer beating 2.5Hz", category: "Jawa" },

  // Tradisional Jepang
  { id: "koto", label: "Koto Silk Zither (Jepang)", desc: "Petikan 13 senar sutra tradisional Jepang bernada syahdu", category: "Japan" },
  { id: "shamisen", label: "Shamisen (Jepang)", desc: "Petikan senar 3 dawai Jepang punchy bachi strike", category: "Japan" },
];

const ALL_DRUM_OPTIONS: Array<{ id: DrumType; label: string; category: "Drum Studio" | "Gendang" | "Goong" | "Angklung & World" }> = [
  // Drum Studio
  { id: "kick", label: "Club 909 Kick", category: "Drum Studio" },
  { id: "snare", label: "Punchy Snare", category: "Drum Studio" },
  { id: "clap", label: "Festival Clap", category: "Drum Studio" },
  { id: "hihat_closed", label: "Closed Hi-Hat", category: "Drum Studio" },
  { id: "hihat_open", label: "Open Hi-Hat", category: "Drum Studio" },
  { id: "tom", label: "Studio Low Tom", category: "Drum Studio" },
  { id: "crash", label: "Crash Cymbal", category: "Drum Studio" },

  // Gendang & Kendang
  { id: "kendang_tung", label: "Kendang Tung (High Slap 220Hz)", category: "Gendang" },
  { id: "kendang_pak", label: "Kendang Pak (Sharp Snappy 380Hz)", category: "Gendang" },
  { id: "kendang_bem", label: "Kendang Bem (Bass Low 55Hz)", category: "Gendang" },
  { id: "kendang_tong", label: "Kulanter Tong (Resonant 280Hz)", category: "Gendang" },
  { id: "kendang_plak", label: "Kendang Plak (Open 460Hz)", category: "Gendang" },
  { id: "kendang_ketuk", label: "Ketuk Kayu (Wood Rim 1200Hz)", category: "Gendang" },
  { id: "kendang_dho", label: "Kendang Koplo Dut (110->42Hz)", category: "Gendang" },
  { id: "kendang_indung", label: "Kendang Indung (Sub 46Hz)", category: "Gendang" },

  // Gong & Goong
  { id: "goong_ageng", label: "Goong Ageng Sub (43.65Hz)", category: "Goong" },
  { id: "goong_suwukan", label: "Goong Suwukan (65.41Hz)", category: "Goong" },
  { id: "kempul_gong", label: "Kempul Gong (140Hz)", category: "Goong" },
  { id: "kenong_gong", label: "Kenong Kettle (280Hz)", category: "Goong" },

  // Angklung & World
  { id: "angklung_hit", label: "Angklung Bamboo Strike", category: "Angklung & World" },
  { id: "taiko_heavy", label: "Taiko O-Daiko Heavy", category: "Angklung & World" },
  { id: "taiko_rim", label: "Taiko Bachi Rimshot", category: "Angklung & World" },
];

interface DrumTrackMeta {
  key: DrumTrackKey;
  label: string;
  defaultSound: DrumType;
  defaultVolume: number;
  activeBg: string;
  ringClass: string;
  textClass: string;
}

const DRUM_TRACKS: DrumTrackMeta[] = [
  {
    key: "kick",
    label: "1. KICK",
    defaultSound: "kick",
    defaultVolume: 0.95,
    activeBg: "bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.65)]",
    ringClass: "ring-cyan-300",
    textClass: "text-cyan-300",
  },
  {
    key: "snare",
    label: "2. SNARE",
    defaultSound: "snare",
    defaultVolume: 0.9,
    activeBg: "bg-fuchsia-400 border-fuchsia-300 shadow-[0_0_8px_rgba(217,70,239,0.65)]",
    ringClass: "ring-fuchsia-300",
    textClass: "text-fuchsia-300",
  },
  {
    key: "clap",
    label: "3. CLAP",
    defaultSound: "clap",
    defaultVolume: 0.85,
    activeBg: "bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.65)]",
    ringClass: "ring-amber-300",
    textClass: "text-amber-300",
  },
  {
    key: "hihat_closed",
    label: "4. CLOSED HAT",
    defaultSound: "hihat_closed",
    defaultVolume: 0.75,
    activeBg: "bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.65)]",
    ringClass: "ring-emerald-300",
    textClass: "text-emerald-300",
  },
  {
    key: "hihat_open",
    label: "5. OPEN HAT",
    defaultSound: "hihat_open",
    defaultVolume: 0.8,
    activeBg: "bg-teal-400 border-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.65)]",
    ringClass: "ring-teal-300",
    textClass: "text-teal-300",
  },
  {
    key: "percussion",
    label: "6. ETNIS PERC",
    defaultSound: "kendang_tung",
    defaultVolume: 0.9,
    activeBg: "bg-sky-400 border-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.65)]",
    ringClass: "ring-sky-300",
    textClass: "text-sky-300",
  },
];

const STEP_LENGTH_PRESETS = [
  { steps: 16, label: "16 Steps", sub: "4/4 Standar" },
  { steps: 13, label: "13 Steps", sub: "Polyrhythm Odd" },
  { steps: 12, label: "12 Steps", sub: "3/4 Triplet" },
  { steps: 8, label: "8 Steps", sub: "Short Loop" },
  { steps: 14, label: "14 Steps", sub: "7/8 Asymmetric" },
  { steps: 24, label: "24 Steps", sub: "6/8 Compound" },
  { steps: 32, label: "32 Steps", sub: "2-Bar Full" },
];

const CHORD_PRESETS: Array<{ name: string; notes: number[]; category: string }> = [
  { name: "Am", notes: [57, 60, 64], category: "Modern" },
  { name: "F", notes: [53, 57, 60], category: "Modern" },
  { name: "C", notes: [60, 64, 67], category: "Modern" },
  { name: "G", notes: [55, 59, 62], category: "Modern" },
  { name: "Dm", notes: [50, 53, 57], category: "Modern" },
  { name: "Em", notes: [52, 55, 59], category: "Modern" },
  { name: "Degung Da-Mi", notes: [60, 61, 67], category: "Sunda" },
  { name: "Degung Na-La", notes: [65, 68, 72], category: "Sunda" },
  { name: "Salendro Barang", notes: [60, 64, 67], category: "Sunda" },
  { name: "Slendro Triad", notes: [60, 62, 67], category: "Jawa" },
  { name: "Pelog Nem", notes: [60, 61, 68], category: "Jawa" },
  { name: "Hirajoshi Koto", notes: [57, 59, 60, 64], category: "Japan" },
  { name: "Insen Kabuki", notes: [57, 58, 62, 64], category: "Japan" },
];

const KEYBOARD_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function formatMidiNote(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function FlStudioStudio() {
  const [subTab, setSubTab] = useState<"sequencer" | "piano" | "fx">("sequencer");
  const [instrument, setInstrument] = useState<InstrumentType>("piano");
  const [baseOctave, setBaseOctave] = useState<number>(4); // Oktaf 4 (C4 = 60)

  // Manual user-pressed notes vs Sequencer auto-play pressed notes
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [seqActiveNotes, setSeqActiveNotes] = useState<Set<number>>(new Set());

  // Piano Live Animation & Step Rec Options
  const [showLivePianoInSeq, setShowLivePianoInSeq] = useState<boolean>(true);
  const [autoFollowOctave, setAutoFollowOctave] = useState<boolean>(true);
  const [followBassOnPiano, setFollowBassOnPiano] = useState<boolean>(false);
  const [stepRecEnabled, setStepRecEnabled] = useState<boolean>(false);
  const [recStepCursor, setRecStepCursor] = useState<number>(0);

  // Tangga Nada / Scales State
  const [selectedScaleId, setSelectedScaleId] = useState<string>("chromatic");
  const [scaleRoot, setScaleRoot] = useState<number>(0);
  const [scaleLock, setScaleLock] = useState<boolean>(false);

  // Sequencer State
  const [pattern, setPattern] = useState<BeatPattern>(FL_STUDIO_PRESETS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [bpm, setBpm] = useState<number>(pattern.bpm);
  const [beatFlash, setBeatFlash] = useState<boolean>(false);
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

  // Refs untuk High-Precision Sequencer Clock tanpa stale closures
  const seqTimerRef = useRef<number | null>(null);
  const stepRef = useRef<number>(0);
  const patternRef = useRef<BeatPattern>(pattern);
  const bpmRef = useRef<number>(bpm);
  const tapTimesRef = useRef<number[]>([]);
  const autoFollowRef = useRef<boolean>(autoFollowOctave);
  const followBassRef = useRef<boolean>(followBassOnPiano);

  patternRef.current = pattern;
  bpmRef.current = bpm;
  autoFollowRef.current = autoFollowOctave;
  followBassRef.current = followBassOnPiano;

  // Zustand Stores
  const deckAStatus = useDeckAStore((s) => s.status);
  const deckBStatus = useDeckBStore((s) => s.status);
  const loadDeckA = useDeckAStore((s) => s.load);
  const loadDeckB = useDeckBStore((s) => s.load);
  const updatePad = useSamplerStore((s) => s.updatePad);

  const deckABpm =
    deckAStatus?.loaded && deckAStatus.bpm > 0
      ? Math.round(deckAStatus.bpm * deckAStatus.speed * 10) / 10
      : null;
  const deckBBpm =
    deckBStatus?.loaded && deckBStatus.bpm > 0
      ? Math.round(deckBStatus.bpm * deckBStatus.speed * 10) / 10
      : null;

  const activeScale: ScaleDefinition =
    MUSICAL_SCALES.find((sc) => sc.id === selectedScaleId) ?? MUSICAL_SCALES[0];

  // Track Config Helpers
  const getTrackConfig = useCallback(
    (key: AllTrackKey): Required<TrackConfig> => {
      const cfg = pattern.trackSettings?.[key];
      const drumMeta = DRUM_TRACKS.find((d) => d.key === key);
      return {
        drumSound: cfg?.drumSound ?? drumMeta?.defaultSound ?? "kick",
        instrument:
          cfg?.instrument ?? (key === "bass" ? "bass" : pattern.instrument),
        volume: cfg?.volume ?? drumMeta?.defaultVolume ?? 0.9,
        muted: cfg?.muted ?? false,
        solo: cfg?.solo ?? false,
      };
    },
    [pattern]
  );

  const updateTrackConfig = (key: AllTrackKey, patch: Partial<TrackConfig>) => {
    setPattern((prev) => {
      const prevTrack = prev.trackSettings?.[key] ?? {};
      const nextPattern: BeatPattern = {
        ...prev,
        trackSettings: {
          ...prev.trackSettings,
          [key]: { ...prevTrack, ...patch },
        },
      };
      if (key === "melody" && patch.instrument) {
        nextPattern.instrument = patch.instrument;
        setInstrument(patch.instrument);
      }
      return nextPattern;
    });
  };

  // Sinkronisasi instrument melodi saat pattern berganti
  const melodyInstrument = getTrackConfig("melody").instrument;

  // Tangga Nada Helpers
  const isNoteInScale = (midiNote: number): boolean => {
    if (activeScale.id === "chromatic") return true;
    const semitone = (midiNote - scaleRoot + 1200) % 12;
    return activeScale.intervals.includes(semitone);
  };

  const quantizeToScale = useCallback(
    (midiNote: number): number => {
      if (activeScale.id === "chromatic" || !scaleLock) return midiNote;
      const semitone = (midiNote - scaleRoot + 1200) % 12;
      if (activeScale.intervals.includes(semitone)) return midiNote;

      let closestDiff = 999;
      let closestInterval = 0;
      for (const iv of activeScale.intervals) {
        const diff = Math.abs(iv - semitone);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestInterval = iv;
        }
      }
      const octaveBase = Math.floor(midiNote / 12) * 12;
      return octaveBase + scaleRoot + closestInterval;
    },
    [activeScale, scaleLock, scaleRoot]
  );

  const getScaleDegreeLabel = (midiNote: number): string | null => {
    if (activeScale.id === "chromatic") return null;
    const semitone = (midiNote - scaleRoot + 1200) % 12;
    const idx = activeScale.intervals.indexOf(semitone);
    if (idx === -1) return null;

    if (activeScale.id === "sunda_pelog_degung") {
      return ["Da", "Mi", "Na", "Ti", "La"][idx] ?? `${idx + 1}`;
    }
    if (activeScale.id === "sunda_salendro") {
      return ["Barang", "Kenong", "Panelu", "Gulu", "Pelite"][idx] ?? `${idx + 1}`;
    }
    if (activeScale.id === "jawa_slendro" || activeScale.id === "jawa_pelog") {
      return ["1 (Ji)", "2 (Ro)", "3 (Lu)", "5 (Mo)", "6 (Nem)", "7 (Pel)"][idx] ?? `${idx + 1}`;
    }
    if (activeScale.id === "japan_hirajoshi" || activeScale.id === "japan_insen") {
      return ["I", "II", "III", "IV", "V"][idx] ?? `${idx + 1}`;
    }
    return `${idx + 1}`;
  };

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

  // Sinkronisasi BPM state ke pattern.bpm untuk WAV export yang akurat
  const updateBpm = (nextBpm: number) => {
    const clamped = Math.max(40, Math.min(240, Math.round(nextBpm * 10) / 10));
    setBpm(clamped);
    setPattern((prev) => ({ ...prev, bpm: clamped }));
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const times = tapTimesRef.current;
    if (times.length > 0 && now - times[times.length - 1] > 2000) {
      tapTimesRef.current = [now];
      return;
    }
    times.push(now);
    if (times.length > 5) times.shift();
    if (times.length >= 2) {
      let sum = 0;
      for (let i = 1; i < times.length; i++) {
        sum += times[i] - times[i - 1];
      }
      const avgMs = sum / (times.length - 1);
      if (avgMs > 200 && avgMs < 2000) {
        updateBpm(Math.round(60000 / avgMs));
      }
    }
  };

  // Memicu animasi sementara tuts piano dari auto-play sequencer
  const flashSeqNote = (midiNote: number, holdMs: number) => {
    setSeqActiveNotes((prev) => {
      const next = new Set(prev);
      next.add(midiNote);
      return next;
    });
    window.setTimeout(() => {
      setSeqActiveNotes((prev) => {
        if (!prev.has(midiNote)) return prev;
        const next = new Set(prev);
        next.delete(midiNote);
        return next;
      });
    }, Math.max(70, holdMs));
  };

  // High-Precision Drift-Compensated Sequencer Player dengan Swing & Live Piano Animation
  useEffect(() => {
    if (!isPlaying) {
      if (seqTimerRef.current !== null) {
        window.clearTimeout(seqTimerRef.current);
        seqTimerRef.current = null;
      }
      setSeqActiveNotes(new Set());
      setBeatFlash(false);
      return;
    }

    let expectedTime = performance.now();
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const curPat = patternRef.current;
      const curBpm = bpmRef.current;
      const stepLen = curPat.stepCount || 16;
      const s = stepRef.current % stepLen;

      setCurrentStep(s);
      if (s % 4 === 0) {
        setBeatFlash(true);
        window.setTimeout(() => setBeatFlash(false), 90);
      }

      const baseStepMs = (60 / curBpm / 4) * 1000;
      const ts = curPat.trackSettings ?? {};
      const anySolo = Object.values(ts).some((c) => c?.solo);
      const isAudible = (key: AllTrackKey) => {
        const cfg = ts[key];
        if (anySolo) return Boolean(cfg?.solo);
        return !cfg?.muted;
      };

      // 1. Play all audible Drum Tracks with custom sound & volume
      for (const meta of DRUM_TRACKS) {
        const active = curPat.tracks[meta.key]?.[s];
        if (active && isAudible(meta.key)) {
          const cfg = ts[meta.key];
          const sound = cfg?.drumSound ?? meta.defaultSound;
          const vol = cfg?.volume ?? meta.defaultVolume;
          synthEngine.playDrum(sound, vol);
        }
      }

      // 2. Play Bass Track
      const bass = curPat.tracks.bass[s];
      if (bass?.active && isAudible("bass")) {
        const bassCfg = ts.bass;
        const bassInst = bassCfg?.instrument ?? "bass";
        const bassVol = bassCfg?.volume ?? 0.9;
        synthEngine.noteOn(bass.note, bassVol, bassInst, baseStepMs * 0.85);
        if (followBassRef.current) {
          flashSeqNote(bass.note, baseStepMs * 0.8);
        }
      }

      // 3. Play Melody Track + Animasi Menekan Tuts Piano Otomatis!
      const mel = curPat.tracks.melody[s];
      if (mel?.active && isAudible("melody")) {
        const melCfg = ts.melody;
        const melInst = melCfg?.instrument ?? curPat.instrument;
        const melVol = melCfg?.volume ?? 0.9;
        const holdMs = baseStepMs * 0.85;

        synthEngine.noteOn(mel.note, melVol, melInst, holdMs);
        flashSeqNote(mel.note, holdMs);

        // Auto-follow oktaf jika nada berada di luar jangkauan 2 oktaf yang tampil
        if (autoFollowRef.current) {
          const noteOct = Math.floor(mel.note / 12);
          setBaseOctave((prevOct) => {
            const minVisible = prevOct * 12;
            const maxVisible = prevOct * 12 + 23;
            if (mel.note < minVisible || mel.note > maxVisible) {
              return Math.max(1, Math.min(6, noteOct));
            }
            return prevOct;
          });
        }
      }

      // Advance step pointer
      const nextStep = (s + 1) % stepLen;
      stepRef.current = nextStep;

      // Hitung interval ke step berikutnya dengan groove Swing akurat
      const swingAmt = curPat.swing * 0.5;
      const delayToNextMs =
        s % 2 === 0
          ? baseStepMs * (1 + swingAmt)
          : baseStepMs * (1 - swingAmt);

      expectedTime += delayToNextMs;
      const drift = performance.now() - expectedTime;
      const waitMs = Math.max(10, delayToNextMs - drift);

      seqTimerRef.current = window.setTimeout(tick, waitMs);
    };

    tick();

    return () => {
      cancelled = true;
      if (seqTimerRef.current !== null) {
        window.clearTimeout(seqTimerRef.current);
        seqTimerRef.current = null;
      }
    };
  }, [isPlaying]);

  // Input Piano Handlers + Live Step Recording
  const handleNoteDown = useCallback(
    (midiInput: number) => {
      const midi = scaleLock ? quantizeToScale(midiInput) : midiInput;
      const activeInst = subTab === "sequencer" ? melodyInstrument : instrument;
      synthEngine.noteOn(midi, 0.9, activeInst);
      setActiveNotes((prev) => new Set(prev).add(midi));

      // Pilih nada ini sebagai nada aktif untuk melukis step melodi!
      setSelectedMelodyNote(midi);

      // Live Step Recording ke track melodi jika mode REC TO STEP aktif
      if (stepRecEnabled) {
        setPattern((prev) => {
          const stepLen = prev.stepCount || 16;
          const targetStep = recStepCursor % stepLen;
          const mel = [...prev.tracks.melody];
          while (mel.length <= targetStep) mel.push({ active: false, note: midi });
          mel[targetStep] = { active: true, note: midi };
          setRecStepCursor((targetStep + 1) % stepLen);
          return { ...prev, tracks: { ...prev.tracks, melody: mel } };
        });
      }
    },
    [instrument, melodyInstrument, recStepCursor, scaleLock, stepRecEnabled, subTab, quantizeToScale]
  );

  const handleNoteUp = useCallback(
    (midiInput: number) => {
      const midi = scaleLock ? quantizeToScale(midiInput) : midiInput;
      synthEngine.noteOff(midi);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });
    },
    [scaleLock, quantizeToScale]
  );

  // Keyboard Komputer PC -> Virtual Piano
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((p) => !p);
        return;
      }
      const key = e.key.toLowerCase();
      const semitone = KEYBOARD_MAP[key];
      if (semitone !== undefined) {
        const midi = baseOctave * 12 + semitone;
        if (!activeNotes.has(midi)) {
          handleNoteDown(midi);
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
        handleNoteUp(midi);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [baseOctave, activeNotes, handleNoteDown, handleNoteUp]);

  const handlePlayChord = (notes: number[]) => {
    const activeInst = subTab === "sequencer" ? melodyInstrument : instrument;
    notes.forEach((n) => {
      synthEngine.noteOn(n, 0.85, activeInst, 850);
      flashSeqNote(n, 850);
    });
  };

  // Mengubah Step Length (16, 13, 12, 8, 14, 24, 32)
  const handleSetStepLength = (newCount: number) => {
    setPattern((prev) => {
      const resizeBools = (arr?: boolean[]): boolean[] => {
        const base = arr ? [...arr] : [];
        while (base.length < newCount) base.push(false);
        return base.slice(0, newCount);
      };
      const resizeNotes = (
        arr: Array<{ active: boolean; note: number }>,
        defNote: number
      ): Array<{ active: boolean; note: number }> => {
        const base = [...arr];
        while (base.length < newCount) base.push({ active: false, note: defNote });
        return base.slice(0, newCount);
      };

      return {
        ...prev,
        stepCount: newCount,
        tracks: {
          kick: resizeBools(prev.tracks.kick),
          snare: resizeBools(prev.tracks.snare),
          clap: resizeBools(prev.tracks.clap),
          hihat_closed: resizeBools(prev.tracks.hihat_closed),
          hihat_open: resizeBools(prev.tracks.hihat_open),
          percussion: resizeBools(prev.tracks.percussion),
          bass: resizeNotes(prev.tracks.bass, 36),
          melody: resizeNotes(prev.tracks.melody, 60),
        },
      };
    });
    if (stepRef.current >= newCount) {
      stepRef.current = 0;
      setCurrentStep(0);
    }
  };

  // Quick Channel Rack Operations (Fill Every 2 / 4, Clear, Shift Left/Right)
  const fillDrumEveryN = (key: DrumTrackKey, everyN: number) => {
    const len = pattern.stepCount || 16;
    setPattern((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [key]: Array.from({ length: len }, (_, i) => i % everyN === 0),
      },
    }));
  };

  const shiftTrackSteps = (key: AllTrackKey, dir: -1 | 1) => {
    const len = pattern.stepCount || 16;
    setPattern((prev) => {
      if (key === "bass" || key === "melody") {
        const arr = [...prev.tracks[key]].slice(0, len);
        while (arr.length < len) arr.push({ active: false, note: key === "bass" ? 36 : 60 });
        const shifted =
          dir === 1 ? [arr[len - 1], ...arr.slice(0, len - 1)] : [...arr.slice(1), arr[0]];
        return { ...prev, tracks: { ...prev.tracks, [key]: shifted } };
      } else {
        const arr = [...(prev.tracks[key] ?? [])].slice(0, len);
        while (arr.length < len) arr.push(false);
        const shifted =
          dir === 1 ? [arr[len - 1], ...arr.slice(0, len - 1)] : [...arr.slice(1), arr[0]];
        return { ...prev, tracks: { ...prev.tracks, [key]: shifted } };
      }
    });
  };

  const clearTrackSteps = (key: AllTrackKey) => {
    const len = pattern.stepCount || 16;
    setPattern((prev) => {
      if (key === "bass" || key === "melody") {
        return {
          ...prev,
          tracks: {
            ...prev.tracks,
            [key]: Array(len)
              .fill(null)
              .map(() => ({ active: false, note: key === "bass" ? 36 : 60 })),
          },
        };
      }
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [key]: Array(len).fill(false),
        },
      };
    });
  };

  const toggleDrumStep = (track: DrumTrackKey, step: number) => {
    setPattern((prev) => {
      const existing = prev.tracks[track] ?? [];
      const trackArray = [...existing];
      while (trackArray.length <= step) trackArray.push(false);
      trackArray[step] = !trackArray[step];
      return {
        ...prev,
        tracks: { ...prev.tracks, [track]: trackArray },
      };
    });
  };

  const toggleNoteStep = (
    track: "bass" | "melody",
    step: number,
    replaceNoteOnly = false
  ) => {
    const targetNote = track === "bass" ? selectedBassNote : selectedMelodyNote;
    setPattern((prev) => {
      const arr = [...prev.tracks[track]];
      while (arr.length <= step) arr.push({ active: false, note: targetNote });
      const current = arr[step];
      if (replaceNoteOnly) {
        arr[step] = { active: true, note: targetNote };
      } else {
        arr[step] = {
          active: !current?.active,
          note: targetNote,
        };
      }
      return {
        ...prev,
        tracks: { ...prev.tracks, [track]: arr },
      };
    });
  };

  // Render & Export WAV ke Sampler Pad atau Deck
  const handleExportToWav = async (target: "download" | "pad" | "deckA" | "deckB") => {
    try {
      setExportNotice("Merender audio remix WAV 44.1kHz...");
      const patternWithCurrentTempo = { ...pattern, bpm };
      const blob = await synthEngine.renderPatternToWavBlob(patternWithCurrentTempo, 2);
      const url = URL.createObjectURL(blob);

      if (target === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `djdex_remix_${pattern.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.wav`;
        a.click();
        setExportNotice("File WAV remix berhasil diunduh ke komputer!");
      } else if (target === "pad") {
        void updatePad(targetPad, {
          name: `${pattern.name.split(" ")[0]} Beat`,
          mode: "loop",
          volume: 1.0,
          syncBpm: true,
          baseBpm: bpm,
        });
        setExportNotice(
          `Beat berhasil dikirim ke Sampler Pad ${(targetPad + 1).toString().padStart(2, "0")} (LOOP Sync ${bpm} BPM)!`
        );
      } else if (target === "deckA") {
        void loadDeckA(url);
        setExportNotice("Beat remix berhasil dimuat ke Deck A untuk live DJ mixing!");
      } else if (target === "deckB") {
        void loadDeckB(url);
        setExportNotice("Beat remix berhasil dimuat ke Deck B untuk live DJ mixing!");
      }

      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      setExportNotice(`Gagal merender loop: ${String(err)}`);
    }
  };

  const effectiveStepCount = pattern.stepCount || 16;

  // Gabungan semua not aktif (manual + auto-play sequencer)
  const combinedPressedNames = useMemo(() => {
    const all = new Set<number>([...activeNotes, ...seqActiveNotes]);
    return Array.from(all)
      .sort((a, b) => a - b)
      .map(formatMidiNote);
  }, [activeNotes, seqActiveNotes]);

  // Helper render Keyboard Piano 3D Skeuomorphic dengan animasi auto-press real-time
  const renderPianoKeyboard = (compact = false) => {
    const whiteIntervals = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
    const blackKeys = [
      { offset: 1, midi: baseOctave * 12 + 1 },
      { offset: 2, midi: baseOctave * 12 + 3 },
      { offset: 4, midi: baseOctave * 12 + 6 },
      { offset: 5, midi: baseOctave * 12 + 8 },
      { offset: 6, midi: baseOctave * 12 + 10 },
      { offset: 8, midi: baseOctave * 12 + 13 },
      { offset: 9, midi: baseOctave * 12 + 15 },
      { offset: 11, midi: baseOctave * 12 + 18 },
      { offset: 12, midi: baseOctave * 12 + 20 },
      { offset: 13, midi: baseOctave * 12 + 22 },
    ];

    return (
      <div className="flex flex-col gap-2">
        {/* Live Monitor Bar di atas Tuts Piano */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#090e18] border border-[#1c293c]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-300 uppercase">
              <span
                className={`w-2 h-2 rounded-full ${
                  seqActiveNotes.size > 0 || activeNotes.size > 0
                    ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
                    : "bg-slate-600"
                }`}
              />
              LIVE PIANO ROLL MONITOR:
            </span>
            <div className="flex items-center gap-1 min-h-[22px]">
              {combinedPressedNames.length > 0 ? (
                combinedPressedNames.map((n, idx) => (
                  <span
                    key={`${n}-${idx}`}
                    className="px-2 py-0.5 text-[10px] font-mono font-black rounded bg-cyan-500/25 border border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.4)] animate-pulse"
                  >
                    {n}
                  </span>
                ))
              ) : (
                <span className="text-[10px] font-mono text-slate-500">
                  Klik tuts atau tekan Play untuk animasi otomatis nada
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Oktaf Quick Shift */}
            <div className="flex items-center gap-1">
              <span className="text-[9.5px] font-mono text-slate-400 font-bold">OKTAF:</span>
              {[2, 3, 4, 5, 6].map((oct) => (
                <button
                  key={oct}
                  type="button"
                  onClick={() => setBaseOctave(oct)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition ${
                    baseOctave === oct
                      ? "bg-fuchsia-500/30 border border-fuchsia-400 text-fuchsia-200"
                      : "bg-[#0c121e] border border-[#1c2738] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  C{oct}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAutoFollowOctave((v) => !v)}
              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition ${
                autoFollowOctave
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                  : "bg-[#0c121e] border-[#1c2738] text-slate-400"
              }`}
              title="Otomatis pindah oktaf mengikuti nada melodi saat Auto-Play"
            >
              {autoFollowOctave ? "AUTO-FOLLOW: ON" : "AUTO-FOLLOW: OFF"}
            </button>

            <button
              type="button"
              onClick={() => setFollowBassOnPiano((v) => !v)}
              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition ${
                followBassOnPiano
                  ? "bg-rose-500/20 border-rose-400 text-rose-300"
                  : "bg-[#0c121e] border-[#1c2738] text-slate-400"
              }`}
              title="Ikut animasikan nada track Bass di tuts piano"
            >
              {followBassOnPiano ? "ANIMASI BASS: ON" : "ANIMASI BASS: OFF"}
            </button>
          </div>
        </div>

        {/* SKEUOMORPHIC 3D PIANO KEYBOARD (2 FULL OCTAVES) */}
        <div className="relative flex justify-center p-3 sm:p-4 rounded-xl bg-gradient-to-b from-[#0a0f1c] to-[#04060a] border border-[#1c293c] shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_12px_30px_rgba(0,0,0,0.8)] overflow-x-auto select-none">
          <div className="relative flex items-start">
            {/* White Keys */}
            {Array.from({ length: 14 }).map((_, wIdx) => {
              const semitone = whiteIntervals[wIdx];
              const midiNote = baseOctave * 12 + semitone;
              const isManual = activeNotes.has(midiNote);
              const isAuto = seqActiveNotes.has(midiNote);
              const isPressed = isManual || isAuto;
              const noteName = NOTE_NAMES[midiNote % 12];
              const octNum = Math.floor(midiNote / 12) - 1;
              const inScale = isNoteInScale(midiNote);
              const degreeLabel = inScale ? getScaleDegreeLabel(midiNote) : null;

              return (
                <button
                  key={midiNote}
                  type="button"
                  onPointerDown={() => handleNoteDown(midiNote)}
                  onPointerUp={() => handleNoteUp(midiNote)}
                  onPointerLeave={() => {
                    if (isManual) handleNoteUp(midiNote);
                  }}
                  className={`relative w-12 sm:w-14 ${
                    compact ? "h-36" : "h-48"
                  } rounded-b-md border flex flex-col justify-end items-center pb-2 transition-all duration-75 ${
                    isAuto && !isManual
                      ? "bg-gradient-to-b from-cyan-100 via-cyan-300 to-cyan-400 border-cyan-400 shadow-[inset_0_5px_10px_rgba(0,0,0,0.35),0_0_20px_rgba(34,211,238,0.85)] translate-y-1.5 scale-[0.98]"
                      : isManual
                      ? "bg-gradient-to-b from-fuchsia-100 via-fuchsia-200 to-fuchsia-300 border-fuchsia-500 shadow-[inset_0_5px_10px_rgba(0,0,0,0.4),0_0_16px_rgba(217,70,239,0.75)] translate-y-1.5 scale-[0.98]"
                      : inScale && activeScale.id !== "chromatic"
                      ? "bg-gradient-to-b from-[#f1f5f9] via-[#e2e8f0] to-[#ecfeff] border-cyan-400/80 shadow-[inset_0_1px_0_#fff,0_0_8px_rgba(6,182,212,0.2)] hover:bg-slate-100"
                      : !inScale && activeScale.id !== "chromatic"
                      ? "bg-gradient-to-b from-[#94a3b8] via-[#64748b] to-[#475569] border-[#334155] opacity-60 hover:opacity-80"
                      : "bg-gradient-to-b from-[#e2e8f0] via-[#cbd5e1] to-[#f8fafc] border-[#182334] shadow-[inset_0_1px_0_#fff,0_6px_8px_rgba(0,0,0,0.6)] hover:bg-slate-100"
                  }`}
                >
                  {/* LED Indicator saat tuts ditekan */}
                  {isPressed && (
                    <span
                      className={`w-2.5 h-2.5 rounded-full mb-auto mt-2 ${
                        isAuto && !isManual
                          ? "bg-cyan-600 shadow-[0_0_10px_#0891b2]"
                          : "bg-fuchsia-600 shadow-[0_0_10px_#c026d3]"
                      }`}
                    />
                  )}
                  {degreeLabel && (
                    <span className="font-mono text-[8px] font-black text-cyan-800 bg-cyan-100/90 px-1 py-0.5 rounded shadow-sm mb-1">
                      {degreeLabel}
                    </span>
                  )}
                  <span className="font-mono text-[9px] font-black text-slate-800">
                    {noteName}
                    {octNum}
                  </span>
                </button>
              );
            })}

            {/* Black Keys (Ebony) */}
            {blackKeys.map(({ offset, midi }) => {
              const isManual = activeNotes.has(midi);
              const isAuto = seqActiveNotes.has(midi);
              const isPressed = isManual || isAuto;
              const noteName = NOTE_NAMES[midi % 12];
              const inScale = isNoteInScale(midi);
              const degreeLabel = inScale ? getScaleDegreeLabel(midi) : null;

              return (
                <button
                  key={midi}
                  type="button"
                  onPointerDown={() => handleNoteDown(midi)}
                  onPointerUp={() => handleNoteUp(midi)}
                  onPointerLeave={() => {
                    if (isManual) handleNoteUp(midi);
                  }}
                  className={`absolute z-10 w-7 sm:w-8 ${
                    compact ? "h-22" : "h-28"
                  } rounded-b border flex flex-col justify-end items-center pb-1.5 transition-all duration-75 ${
                    isAuto && !isManual
                      ? "bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-700 border-cyan-300 shadow-[inset_0_3px_6px_rgba(0,0,0,0.5),0_0_20px_rgba(34,211,238,0.95)] translate-y-1.5 scale-[0.97]"
                      : isManual
                      ? "bg-gradient-to-b from-fuchsia-500 via-fuchsia-700 to-fuchsia-900 border-fuchsia-400 shadow-[inset_0_3px_6px_rgba(0,0,0,0.6),0_0_18px_rgba(217,70,239,0.9)] translate-y-1.5 scale-[0.97]"
                      : inScale && activeScale.id !== "chromatic"
                      ? "bg-gradient-to-b from-[#164e63] via-[#0e7490] to-[#042f2e] border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.45)]"
                      : !inScale && activeScale.id !== "chromatic"
                      ? "bg-gradient-to-b from-[#1e293b] to-[#0f172a] border-[#334155] opacity-40 hover:opacity-60"
                      : "bg-gradient-to-b from-[#1e293b] via-[#0f172a] to-[#020617] border-black shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_6px_10px_rgba(0,0,0,0.9)] hover:bg-[#111827]"
                  }`}
                  style={{
                    left: `calc(${offset} * 3rem - 0.9rem)`,
                  }}
                >
                  {isPressed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white mb-auto mt-1.5 shadow-[0_0_8px_#fff]" />
                  )}
                  {degreeLabel && (
                    <span className="font-mono text-[7px] font-black text-cyan-200 bg-cyan-900/80 px-0.5 rounded mb-0.5">
                      {degreeLabel}
                    </span>
                  )}
                  <span className="font-mono text-[8px] font-bold text-slate-200">
                    {noteName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl bg-[#070b14] border border-[#1a2538] shadow-2xl">
      {/* Header Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#182335]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full transition-all ${
                beatFlash
                  ? "bg-cyan-300 shadow-[0_0_14px_#22d3ee] scale-125"
                  : isPlaying
                  ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
                  : "bg-fuchsia-500 shadow-[0_0_8px_#d946ef]"
              }`}
            />
            <h2 className="font-display text-sm font-black tracking-widest text-slate-100 uppercase">
              FL Studio Mobile Remix &amp; Live Synth Studio
            </h2>
          </div>
          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-[#101827] border border-[#1f2d42] text-cyan-300 font-bold">
            {bpm} BPM · {effectiveStepCount} Steps
          </span>
        </div>

        {/* Tab Sub-View Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#05080f] border border-[#162130] flex-wrap">
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
            Channel Rack &amp; Live Piano ({effectiveStepCount} Steps)
          </button>

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
            Virtual Piano &amp; Scales
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
            Master FX Rack
          </button>
        </div>
      </div>

      {/* Global Transport, Tempo Engine & Sync Bar (Selalu Tampil di semua sub-tab!) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090f1b] border border-[#1d2b40] shadow-inner">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (!isPlaying) stepRef.current = 0;
              setIsPlaying(!isPlaying);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-display text-xs font-black tracking-widest transition-all ${
              isPlaying
                ? "bg-red-500/25 border border-red-500 text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.5)]"
                : "bg-emerald-500/25 border border-emerald-400 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.5)]"
            }`}
          >
            {isPlaying ? <IconStop className="w-4 h-4" /> : <IconPlay className="w-4 h-4" />}
            {isPlaying ? "STOP PLAYER" : "PLAY REMIX"}
          </button>

          {/* Preset Loader */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">PRESET:</span>
            <select
              value={pattern.name}
              onChange={(e) => {
                const found = FL_STUDIO_PRESETS.find((p) => p.name === e.target.value);
                if (found) {
                  setPattern(found);
                  setBpm(found.bpm);
                  setInstrument(found.instrument);
                  stepRef.current = 0;
                  setCurrentStep(0);
                }
              }}
              className="bg-[#05080f] border border-[#223146] text-slate-200 text-xs font-bold rounded px-2.5 py-1.5 focus:border-cyan-400 focus:outline-none max-w-[230px]"
            >
              {FL_STUDIO_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tempo Engine Controls: Input, -1/+1, 1/2x, 2x, Tap Tempo, Sync Deck A/B */}
        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
          <div className="flex items-center gap-1 bg-[#05080e] border border-[#1d2a3d] rounded-lg p-1">
            <button
              type="button"
              onClick={() => updateBpm(bpm / 2)}
              className="px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:text-cyan-300 rounded hover:bg-[#101826]"
              title="Half Tempo (½×)"
            >
              ½×
            </button>
            <button
              type="button"
              onClick={() => updateBpm(bpm - 1)}
              className="px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:text-white rounded hover:bg-[#101826]"
              title="Turunkan 1 BPM"
            >
              −
            </button>
            <input
              type="number"
              min={40}
              max={240}
              step={0.5}
              value={bpm}
              onChange={(e) => updateBpm(Number(e.target.value))}
              className="w-14 py-0.5 text-center font-black text-cyan-300 bg-transparent focus:outline-none"
            />
            <span className="text-[9.5px] text-slate-500 font-bold pr-1">BPM</span>
            <button
              type="button"
              onClick={() => updateBpm(bpm + 1)}
              className="px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:text-white rounded hover:bg-[#101826]"
              title="Naikkan 1 BPM"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => updateBpm(bpm * 2)}
              className="px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:text-cyan-300 rounded hover:bg-[#101826]"
              title="Double Tempo (2×)"
            >
              2×
            </button>
          </div>

          <button
            type="button"
            onClick={handleTapTempo}
            className="px-2.5 py-1.5 text-[10px] font-bold rounded bg-[#0c1422] border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 active:scale-95 transition"
            title="Ketuk tombol ini sesuai ketukan musik untuk mendeteksi BPM"
          >
            TAP TEMPO
          </button>

          <button
            type="button"
            disabled={!deckABpm}
            onClick={() => {
              if (deckABpm) updateBpm(deckABpm);
            }}
            className="px-2 py-1.5 text-[10px] font-bold rounded bg-[#0c1422] border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 transition"
            title="Sinkronkan BPM ke Deck A"
          >
            SYNC A {deckABpm ? `(${deckABpm})` : ""}
          </button>

          <button
            type="button"
            disabled={!deckBBpm}
            onClick={() => {
              if (deckBBpm) updateBpm(deckBBpm);
            }}
            className="px-2 py-1.5 text-[10px] font-bold rounded bg-[#0c1422] border border-pink-500/40 text-pink-300 hover:bg-pink-500/20 disabled:opacity-40 transition"
            title="Sinkronkan BPM ke Deck B"
          >
            SYNC B {deckBBpm ? `(${deckBBpm})` : ""}
          </button>

          {/* Swing */}
          <div className="flex items-center gap-1.5 bg-[#05080e] border border-[#1d2a3d] rounded-lg px-2 py-1">
            <span className="text-[9.5px] text-slate-400 font-bold">SWING:</span>
            <input
              type="range"
              min={0}
              max={0.65}
              step={0.05}
              value={pattern.swing}
              onChange={(e) => setPattern((prev) => ({ ...prev, swing: Number(e.target.value) }))}
              className="w-16 accent-fuchsia-400 cursor-pointer"
            />
            <span className="text-[10px] text-fuchsia-300 font-bold w-8">
              {Math.round(pattern.swing * 100)}%
            </span>
          </div>
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

      {/* TAB 1: CHANNEL RACK FL STUDIO MOBILE & LIVE ANIMATED PIANO */}
      {subTab === "sequencer" && (
        <div className="flex flex-col gap-3">
          {/* Step Length Selector & Quick Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#080d17] border border-[#1b273a]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-wider mr-1">
                STEP LENGTH:
              </span>
              {STEP_LENGTH_PRESETS.map((item) => (
                <button
                  key={item.steps}
                  type="button"
                  onClick={() => handleSetStepLength(item.steps)}
                  className={`px-2 py-1 text-[10px] font-mono font-bold rounded border transition-all ${
                    effectiveStepCount === item.steps
                      ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                      : "bg-[#0b101a] border-[#1c2738] text-slate-400 hover:text-slate-200"
                  }`}
                  title={`${item.label} - ${item.sub}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setStepRecEnabled((r) => !r)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition ${
                  stepRecEnabled
                    ? "bg-red-500/25 border-red-400 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.45)] animate-pulse"
                    : "bg-[#0c121e] border-[#1e2a3c] text-slate-400 hover:text-slate-200"
                }`}
                title="Aktifkan lalu mainkan tuts piano untuk merekam melodi langsung ke Step Sequencer!"
              >
                <IconFlash className="w-3 h-3" />
                {stepRecEnabled ? `STEP REC (Step ${recStepCursor + 1})` : "STEP REC: OFF"}
              </button>

              <button
                type="button"
                onClick={() => setShowLivePianoInSeq((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition ${
                  showLivePianoInSeq
                    ? "bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-300"
                    : "bg-[#0c121e] border-[#1e2a3c] text-slate-400"
                }`}
              >
                <IconPiano className="w-3 h-3" />
                {showLivePianoInSeq ? "Sembunyikan Piano Live" : "Tampilkan Piano Live"}
              </button>
            </div>
          </div>

          {/* FL STUDIO MOBILE CHANNEL RACK MATRIX */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#05080f] border border-[#162130] overflow-x-auto select-none">
            {/* Step Numbers Header */}
            <div className="flex items-center gap-2 pb-1.5 border-b border-[#141c28] min-w-[820px]">
              <div className="w-[260px] shrink-0 flex items-center justify-between text-[9px] font-mono font-bold text-slate-400 uppercase px-1">
                <span>CHANNEL RACK / SOUND</span>
                <span>M · S · VOL</span>
              </div>
              <div
                className="grid flex-1 gap-1"
                style={{ gridTemplateColumns: `repeat(${effectiveStepCount}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: effectiveStepCount }).map((_, step) => (
                  <span
                    key={step}
                    className={`text-center font-mono text-[9px] font-bold py-0.5 rounded ${
                      currentStep === step && isPlaying
                        ? "bg-cyan-500/30 text-cyan-200"
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

            {/* 1 - 6. Drum & Ethnic Percussion Tracks (Dengan Sound Switcher, Mute, Solo, Volume, Tools) */}
            {DRUM_TRACKS.map((meta) => {
              const cfg = getTrackConfig(meta.key);
              const trackSteps = pattern.tracks[meta.key] ?? [];

              return (
                <div key={meta.key} className="flex items-center gap-2 min-w-[820px]">
                  {/* Channel Strip Header */}
                  <div className="w-[260px] shrink-0 flex items-center gap-1.5 p-1 rounded-lg bg-[#0b111c] border border-[#1a2538]">
                    {/* Trigger Test Button + Sound Picker */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => synthEngine.playDrum(cfg.drumSound, cfg.volume)}
                          className={`font-display text-[10.5px] font-bold ${meta.textClass} hover:underline truncate text-left`}
                          title="Klik untuk preview suara track ini"
                        >
                          {meta.label}
                        </button>
                        {/* Mini Quick Tools */}
                        <div className="flex items-center gap-0.5 text-[8px] font-mono">
                          <button
                            type="button"
                            onClick={() => fillDrumEveryN(meta.key, 4)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-cyan-300"
                            title="Fill setiap 4 step"
                          >
                            4
                          </button>
                          <button
                            type="button"
                            onClick={() => fillDrumEveryN(meta.key, 2)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-cyan-300"
                            title="Fill setiap 2 step"
                          >
                            2
                          </button>
                          <button
                            type="button"
                            onClick={() => shiftTrackSteps(meta.key, -1)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-white"
                            title="Geser pola ke kiri"
                          >
                            &lt;
                          </button>
                          <button
                            type="button"
                            onClick={() => shiftTrackSteps(meta.key, 1)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-white"
                            title="Geser pola ke kanan"
                          >
                            &gt;
                          </button>
                          <button
                            type="button"
                            onClick={() => clearTrackSteps(meta.key)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-red-400"
                            title="Kosongkan track"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <select
                        value={cfg.drumSound}
                        onChange={(e) =>
                          updateTrackConfig(meta.key, { drumSound: e.target.value as DrumType })
                        }
                        className="w-full bg-[#05080f] border border-[#1c293c] text-[9px] font-mono text-slate-300 rounded px-1 py-0.5 truncate focus:border-cyan-400 focus:outline-none"
                        title="Ganti suara / instrumen track ini"
                      >
                        {(["Drum Studio", "Gendang", "Goong", "Angklung & World"] as const).map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {ALL_DRUM_OPTIONS.filter((o) => o.category === cat).map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* M / S / Volume */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTrackConfig(meta.key, { muted: !cfg.muted })}
                          className={`w-5 h-5 text-[9px] font-mono font-black rounded border ${
                            cfg.muted
                              ? "bg-red-500/30 border-red-400 text-red-200"
                              : "bg-[#111927] border-[#223146] text-slate-400 hover:text-slate-200"
                          }`}
                          title="Mute Track"
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTrackConfig(meta.key, { solo: !cfg.solo })}
                          className={`w-5 h-5 text-[9px] font-mono font-black rounded border ${
                            cfg.solo
                              ? "bg-amber-500/35 border-amber-400 text-amber-200"
                              : "bg-[#111927] border-[#223146] text-slate-400 hover:text-slate-200"
                          }`}
                          title="Solo Track"
                        >
                          S
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.3}
                        step={0.05}
                        value={cfg.volume}
                        onChange={(e) =>
                          updateTrackConfig(meta.key, { volume: Number(e.target.value) })
                        }
                        className="w-11 h-1 accent-cyan-400 cursor-pointer"
                        title={`Volume Track: ${Math.round(cfg.volume * 100)}%`}
                      />
                    </div>
                  </div>

                  {/* Step Matrix Buttons */}
                  <div
                    className={`grid flex-1 gap-1 transition-opacity ${
                      cfg.muted ? "opacity-35" : "opacity-100"
                    }`}
                    style={{ gridTemplateColumns: `repeat(${effectiveStepCount}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: effectiveStepCount }).map((_, step) => {
                      const active = trackSteps[step] ?? false;
                      const isCurrent = currentStep === step && isPlaying;
                      const isBeatLead = Math.floor(step / 4) % 2 === 0;
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={() => toggleDrumStep(meta.key, step)}
                          className={`h-9 rounded border transition-all ${
                            isCurrent ? `ring-2 ${meta.ringClass} scale-105` : ""
                          } ${
                            active
                              ? meta.activeBg
                              : isBeatLead
                              ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538]"
                              : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c]"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 7. Tuned Bassline Track (Support ganti instrumen + Mute/Solo/Vol + Note Picker) */}
            {(() => {
              const bassCfg = getTrackConfig("bass");
              return (
                <div className="flex items-center gap-2 min-w-[820px] pt-1.5 border-t border-[#162235]">
                  <div className="w-[260px] shrink-0 flex items-center gap-1.5 p-1 rounded-lg bg-[#0b111c] border border-rose-500/30">
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display text-[10.5px] font-bold text-rose-300 truncate">
                          7. BASS / SUB
                        </span>
                        <div className="flex items-center gap-0.5 text-[8px] font-mono">
                          <select
                            value={selectedBassNote}
                            onChange={(e) => setSelectedBassNote(Number(e.target.value))}
                            className="bg-[#05080f] border border-[#233248] text-rose-300 rounded px-1 py-0 text-[8.5px]"
                            title="Pilih nada bass saat menggambar step"
                          >
                            {[29, 31, 33, 34, 36, 38, 39, 41, 43, 45, 48].map((n) => (
                              <option key={n} value={n}>
                                {formatMidiNote(n)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => shiftTrackSteps("bass", -1)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-white"
                          >
                            &lt;
                          </button>
                          <button
                            type="button"
                            onClick={() => shiftTrackSteps("bass", 1)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-white"
                          >
                            &gt;
                          </button>
                          <button
                            type="button"
                            onClick={() => clearTrackSteps("bass")}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-red-400"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <select
                        value={bassCfg.instrument}
                        onChange={(e) =>
                          updateTrackConfig("bass", {
                            instrument: e.target.value as InstrumentType,
                          })
                        }
                        className="w-full bg-[#05080f] border border-[#1c293c] text-[9px] font-mono text-rose-200 rounded px-1 py-0.5 truncate"
                        title="Ganti instrumen Bass"
                      >
                        {INSTRUMENT_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTrackConfig("bass", { muted: !bassCfg.muted })}
                          className={`w-5 h-5 text-[9px] font-mono font-black rounded border ${
                            bassCfg.muted
                              ? "bg-red-500/30 border-red-400 text-red-200"
                              : "bg-[#111927] border-[#223146] text-slate-400"
                          }`}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTrackConfig("bass", { solo: !bassCfg.solo })}
                          className={`w-5 h-5 text-[9px] font-mono font-black rounded border ${
                            bassCfg.solo
                              ? "bg-amber-500/35 border-amber-400 text-amber-200"
                              : "bg-[#111927] border-[#223146] text-slate-400"
                          }`}
                        >
                          S
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.3}
                        step={0.05}
                        value={bassCfg.volume}
                        onChange={(e) =>
                          updateTrackConfig("bass", { volume: Number(e.target.value) })
                        }
                        className="w-11 h-1 accent-rose-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div
                    className={`grid flex-1 gap-1 transition-opacity ${
                      bassCfg.muted ? "opacity-35" : "opacity-100"
                    }`}
                    style={{ gridTemplateColumns: `repeat(${effectiveStepCount}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: effectiveStepCount }).map((_, step) => {
                      const stepData = pattern.tracks.bass[step] ?? {
                        active: false,
                        note: selectedBassNote,
                      };
                      const isCurrent = currentStep === step && isPlaying;
                      const isBeatLead = Math.floor(step / 4) % 2 === 0;
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={(e) => toggleNoteStep("bass", step, e.shiftKey)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            toggleNoteStep("bass", step, true);
                          }}
                          title="Klik toggle step, Klik Kanan / Shift+Klik ganti nada"
                          className={`h-9 rounded border transition-all flex items-center justify-center font-mono text-[8.5px] font-bold ${
                            isCurrent ? "ring-2 ring-rose-400 scale-105" : ""
                          } ${
                            stepData.active
                              ? "bg-rose-500 border-rose-400 text-white shadow-[0_0_8px_rgba(244,63,94,0.65)]"
                              : isBeatLead
                              ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538] text-slate-500"
                              : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c] text-slate-600"
                          }`}
                        >
                          {stepData.active ? formatMidiNote(stepData.note) : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 8. Piano / Melodic Synth / Ethnic Instrument Track (Animasi Piano Sinkron!) */}
            {(() => {
              const melCfg = getTrackConfig("melody");
              return (
                <div className="flex items-center gap-2 min-w-[820px]">
                  <div className="w-[260px] shrink-0 flex items-center gap-1.5 p-1 rounded-lg bg-[#0b111c] border border-violet-500/40">
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display text-[10.5px] font-bold text-violet-300 truncate">
                          8. PIANO / MELODY
                        </span>
                        <div className="flex items-center gap-0.5 text-[8px] font-mono">
                          <span
                            className="px-1.5 py-0 rounded bg-violet-500/20 border border-violet-400/50 text-violet-200 font-bold"
                            title="Nada kuas aktif (klik tuts piano di bawah untuk mengganti nada ini!)"
                          >
                            {formatMidiNote(selectedMelodyNote)}
                          </span>
                          <button
                            type="button"
                            onClick={() => shiftTrackSteps("melody", -1)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-white"
                          >
                            &lt;
                          </button>
                          <button
                            type="button"
                            onClick={() => shiftTrackSteps("melody", 1)}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-white"
                          >
                            &gt;
                          </button>
                          <button
                            type="button"
                            onClick={() => clearTrackSteps("melody")}
                            className="px-1 rounded bg-[#141d2e] text-slate-400 hover:text-red-400"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <select
                        value={melCfg.instrument}
                        onChange={(e) =>
                          updateTrackConfig("melody", {
                            instrument: e.target.value as InstrumentType,
                          })
                        }
                        className="w-full bg-[#05080f] border border-[#1c293c] text-[9px] font-mono text-violet-200 rounded px-1 py-0.5 truncate"
                        title="Ganti instrumen melodi (Piano, Angklung, Suling, Goong, Koto, Lead, dll)"
                      >
                        {(["Modern", "Sunda", "Jawa", "Japan"] as const).map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {INSTRUMENT_OPTIONS.filter((o) => o.category === cat).map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTrackConfig("melody", { muted: !melCfg.muted })}
                          className={`w-5 h-5 text-[9px] font-mono font-black rounded border ${
                            melCfg.muted
                              ? "bg-red-500/30 border-red-400 text-red-200"
                              : "bg-[#111927] border-[#223146] text-slate-400"
                          }`}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTrackConfig("melody", { solo: !melCfg.solo })}
                          className={`w-5 h-5 text-[9px] font-mono font-black rounded border ${
                            melCfg.solo
                              ? "bg-amber-500/35 border-amber-400 text-amber-200"
                              : "bg-[#111927] border-[#223146] text-slate-400"
                          }`}
                        >
                          S
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.3}
                        step={0.05}
                        value={melCfg.volume}
                        onChange={(e) =>
                          updateTrackConfig("melody", { volume: Number(e.target.value) })
                        }
                        className="w-11 h-1 accent-violet-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div
                    className={`grid flex-1 gap-1 transition-opacity ${
                      melCfg.muted ? "opacity-35" : "opacity-100"
                    }`}
                    style={{ gridTemplateColumns: `repeat(${effectiveStepCount}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: effectiveStepCount }).map((_, step) => {
                      const stepData = pattern.tracks.melody[step] ?? {
                        active: false,
                        note: selectedMelodyNote,
                      };
                      const isCurrent = currentStep === step && isPlaying;
                      const isBeatLead = Math.floor(step / 4) % 2 === 0;
                      const isRecCursor = stepRecEnabled && recStepCursor === step;
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={(e) => toggleNoteStep("melody", step, e.shiftKey)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            toggleNoteStep("melody", step, true);
                          }}
                          title="Klik toggle step, Klik Kanan / Shift+Klik ganti nada dengan nada aktif dari piano"
                          className={`h-9 rounded border transition-all flex items-center justify-center font-mono text-[8.5px] font-bold ${
                            isCurrent
                              ? "ring-2 ring-cyan-300 scale-105"
                              : isRecCursor
                              ? "ring-2 ring-red-400"
                              : ""
                          } ${
                            stepData.active
                              ? "bg-violet-500 border-violet-300 text-white shadow-[0_0_8px_rgba(139,92,246,0.65)]"
                              : isBeatLead
                              ? "bg-[#111927] border-[#223146] hover:bg-[#1a2538] text-slate-500"
                              : "bg-[#090e17] border-[#182333] hover:bg-[#131d2c] text-slate-600"
                          }`}
                        >
                          {stepData.active ? formatMidiNote(stepData.note) : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* LIVE ANIMATED PIANO KEYBOARD DOCK (Otomatis menekan tuts saat Auto-Play melodi!) */}
          {showLivePianoInSeq && (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#070b14] border border-[#1d2b40]">
              {renderPianoKeyboard(true)}
              <p className="text-center font-mono text-[10px] text-slate-400">
                Animasi Sinkron: Saat Auto-Play berjalan, tuts piano otomatis menekan &amp; menyala sesuai nada melodi. Klik tuts mana saja untuk memilih nada kuas (<span className="text-violet-300 font-bold">{formatMidiNote(selectedMelodyNote)}</span>), lalu klik atau klik-kanan kotak step di atas!
              </p>
            </div>
          )}

          {/* Export & DJ Integration Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <div className="flex items-center gap-2 flex-wrap">
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

            <div className="flex items-center gap-2 flex-wrap">
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

      {/* TAB 2: VIRTUAL PIANO FULL VIEW & ETHNIC SCALES */}
      {subTab === "piano" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                INSTRUMEN PIANO:
              </span>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentType)}
                className="bg-[#05080f] border border-[#233348] text-slate-100 text-xs font-bold rounded px-3 py-1.5 focus:border-fuchsia-400 focus:outline-none"
              >
                {(["Modern", "Sunda", "Jawa", "Japan"] as const).map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {INSTRUMENT_OPTIONS.filter((o) => o.category === cat).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScaleLock(!scaleLock)}
                className={`px-3 py-1 text-xs font-mono font-bold rounded border transition-all ${
                  scaleLock
                    ? "bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                    : "bg-[#0c121e] border-[#1e2a3c] text-slate-400 hover:text-slate-200"
                }`}
                title="Kunci tuts keyboard komputer dan klik agar otomatis quantize ke tangga nada tanpa fals"
              >
                {scaleLock ? "SCALE LOCK: AKTIF" : "SCALE LOCK: OFF"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e18] border border-[#1c293c]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-wider">
                TANGGA NADA / SKALA:
              </span>
              <select
                value={selectedScaleId}
                onChange={(e) => setSelectedScaleId(e.target.value)}
                className="bg-[#05080f] border border-[#233348] text-cyan-300 text-xs font-bold rounded px-3 py-1.5 focus:border-cyan-400 focus:outline-none"
              >
                {MUSICAL_SCALES.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    [{sc.region}] {sc.name}
                  </option>
                ))}
              </select>

              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider ml-2">
                ROOT:
              </span>
              <select
                value={scaleRoot}
                onChange={(e) => setScaleRoot(Number(e.target.value))}
                className="bg-[#05080f] border border-[#233348] text-slate-200 text-xs font-bold rounded px-2 py-1.5 focus:border-cyan-400 focus:outline-none"
              >
                {NOTE_NAMES.map((n, idx) => (
                  <option key={n} value={idx}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[10.5px] font-mono text-slate-400 max-w-sm truncate" title={activeScale.description}>
              {activeScale.description}
            </p>
          </div>

          {/* Quick Chords Bar */}
          <div className="flex items-center gap-1.5 p-2 rounded-xl bg-[#060912] border border-[#162130] flex-wrap">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mr-1">
              CHORD PRESETS:
            </span>
            {CHORD_PRESETS.map((ch) => (
              <button
                key={ch.name}
                type="button"
                onClick={() => handlePlayChord(ch.notes)}
                className={`px-2 py-1 text-[10px] font-mono font-bold rounded border active:scale-95 transition ${
                  ch.category === "Sunda"
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                    : ch.category === "Jawa"
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                    : ch.category === "Japan"
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25"
                    : "bg-[#0c121e] border-[#202d40] text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400"
                }`}
                title={`Mainkan Chord ${ch.name} (${ch.category})`}
              >
                {ch.name}
              </button>
            ))}
          </div>

          {renderPianoKeyboard(false)}

          <p className="text-center font-mono text-[10.5px] text-slate-400">
            Keyboard PC: <span className="text-cyan-300 font-bold">A, S, D, F, G, H, J, K</span> (Putih) · <span className="text-pink-300 font-bold">W, E, T, Y, U, O</span> (Hitam) · <span className="text-emerald-300 font-bold">Space</span> (Play/Stop Sequencer).
          </p>
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
