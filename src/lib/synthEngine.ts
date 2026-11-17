/**
 * DJDeX Web Audio DSP Synthesizer & FL Studio Beat Engine
 *
 * Menyediakan:
 * 1. Multi-instrument polyphonic synth:
 *    - Modern: Acoustic Grand Piano, Rhodes EP, EDM Supersaw Lead, 808 Sub Bass, Club Organ, Pluck, Strings
 *    - Tradisional Sunda: Suling Sunda Degung, Angklung Bambu
 *    - Tradisional Jawa: Gamelan Saron Demung, Gong Ageng Jawa
 *    - Tradisional Jepang: Koto Zither, Shamisen
 * 2. Dedicated drum synthesizer:
 *    - Modern: Kick, Snare, Clap, Hi-Hat Closed/Open, Tom, Crash
 *    - Etnis Sunda & Jawa: Kendang Tung, Kendang Pak, Kendang Bem, Koplo Dho/Dut
 *    - Etnis Jepang: Taiko Heavy (O-Daiko), Taiko Bachi Rim
 * 3. Master FX Rack: Reverb, BPM-synced Delay, Cutoff/Resonance Filter, Distortion/Saturation.
 * 4. Flexible Step Sequencer: 16-step (4/4), 13-step (polyrhythm), 12-step (triplet), 8-step, 24-step, 32-step.
 * 5. Sistem Tangga Nada Etnis (Sunda Salendro, Sunda Pelog Degung, Jawa Slendro, Jawa Pelog, Japan Hirajoshi, Japan Insen).
 * 6. WAV Audio Exporter untuk merender loop/melodi langsung ke file audio 44.1kHz.
 */

export type InstrumentType =
  | "piano"
  | "rhodes"
  | "lead"
  | "bass"
  | "organ"
  | "pluck"
  | "strings"
  | "sundanese_suling"
  | "angklung"
  | "gamelan_saron"
  | "gamelan_gong"
  | "koto"
  | "shamisen";

export type DrumType =
  | "kick"
  | "snare"
  | "clap"
  | "hihat_closed"
  | "hihat_open"
  | "tom"
  | "crash"
  | "kendang_tung"
  | "kendang_pak"
  | "kendang_bem"
  | "kendang_dho"
  | "taiko_heavy"
  | "taiko_rim";

export interface FxSettings {
  reverb: { enabled: boolean; size: number; wet: number };
  delay: { enabled: boolean; timeSecs: number; feedback: number; wet: number };
  filter: { enabled: boolean; cutoff: number; resonance: number; type: BiquadFilterType };
  distortion: { enabled: boolean; drive: number };
  masterVolume: number;
}

export interface ScaleDefinition {
  id: string;
  name: string;
  region: "Western" | "Sunda" | "Jawa" | "Japan";
  description: string;
  intervals: number[]; // semitone offset dari C (0..11)
}

export const MUSICAL_SCALES: ScaleDefinition[] = [
  {
    id: "chromatic",
    name: "Chromatic (Semua Nada 12-TET)",
    region: "Western",
    description: "Semua 12 nada bebas tanpa batasan tangga nada",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
  {
    id: "sunda_salendro",
    name: "Sunda Salendro (Barang, Kenong, Panelu...)",
    region: "Sunda",
    description: "Tangga nada 5-nada Salendro Sunda khas Wayang Golek & Jaipongan",
    intervals: [0, 2, 4, 7, 9],
  },
  {
    id: "sunda_pelog_degung",
    name: "Sunda Pelog Degung (Da-Mi-Na-Ti-La)",
    region: "Sunda",
    description: "Tangga nada Gamelan Degung Sunda khas Jawa Barat yang syahdu",
    intervals: [0, 1, 5, 7, 8],
  },
  {
    id: "jawa_slendro",
    name: "Jawa Slendro Gamelan (1 2 3 5 6)",
    region: "Jawa",
    description: "Tangga nada Slendro Jawa dengan interval 5 nada berjarak seimbang",
    intervals: [0, 2, 5, 7, 9],
  },
  {
    id: "jawa_pelog",
    name: "Jawa Pelog Gamelan (Pathet Nem)",
    region: "Jawa",
    description: "Tangga nada Pelog Jawa dengan nuansa mistis megah gamelan keraton",
    intervals: [0, 1, 3, 7, 8],
  },
  {
    id: "japan_hirajoshi",
    name: "Japan Hirajoshi (Koto & Shamisen)",
    region: "Japan",
    description: "Tangga nada tradisional Jepang untuk Koto & Shamisen (A-B-C-E-F)",
    intervals: [0, 2, 3, 7, 8],
  },
  {
    id: "japan_insen",
    name: "Japan Insen (Shakuhachi / Kabuki)",
    region: "Japan",
    description: "Tangga nada tradisional Jepang Insen untuk tiupan bambu & teater",
    intervals: [0, 1, 5, 7, 10],
  },
  {
    id: "minor_pentatonic",
    name: "Minor Pentatonic / Blues",
    region: "Western",
    description: "Tangga nada pentatonik minor untuk EDM drop, Rock & Hip Hop",
    intervals: [0, 3, 5, 7, 10],
  },
];

export interface BeatPattern {
  name: string;
  bpm: number;
  swing: number; // 0..0.75
  stepCount: number; // 8, 12, 13, 14, 16, 24, 32
  instrument: InstrumentType;
  tracks: {
    kick: boolean[];
    snare: boolean[];
    clap: boolean[];
    hihat_closed: boolean[];
    hihat_open: boolean[];
    percussion: boolean[]; // Kendang, Taiko, Conga, Tom
    bass: Array<{ active: boolean; note: number }>;
    melody: Array<{ active: boolean; note: number }>;
  };
}

class SynthAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private waveshaperNode: WaveShaperNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private delayDry: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private reverbDry: GainNode | null = null;

  private activeVoices = new Map<number, { stop: () => void }>();

  public fx: FxSettings = {
    reverb: { enabled: true, size: 0.6, wet: 0.3 },
    delay: { enabled: false, timeSecs: 0.375, feedback: 0.4, wet: 0.25 },
    filter: { enabled: false, cutoff: 18000, resonance: 1.0, type: "lowpass" },
    distortion: { enabled: false, drive: 0.2 },
    masterVolume: 0.9,
  };

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.setupFxChain();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private setupFxChain() {
    if (!this.ctx) return;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.fx.masterVolume;

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = this.fx.filter.type;
    this.filterNode.frequency.value = this.fx.filter.cutoff;
    this.filterNode.Q.value = this.fx.filter.resonance;

    this.waveshaperNode = this.ctx.createWaveShaper();
    this.updateDistortionCurve(this.fx.distortion.drive);

    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = this.fx.delay.timeSecs;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = this.fx.delay.feedback;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = this.fx.delay.enabled ? this.fx.delay.wet : 0;
    this.delayDry = this.ctx.createGain();
    this.delayDry.gain.value = 1.0;

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);

    this.reverbConvolver = this.ctx.createConvolver();
    this.createSyntheticImpulse(this.fx.reverb.size);
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = this.fx.reverb.enabled ? this.fx.reverb.wet : 0;
    this.reverbDry = this.ctx.createGain();
    this.reverbDry.gain.value = 1.0;

    this.waveshaperNode.connect(this.filterNode);
    this.filterNode.connect(this.delayDry);
    this.filterNode.connect(this.delayNode);

    this.delayDry.connect(this.reverbDry);
    this.delayWet.connect(this.reverbDry);
    this.delayDry.connect(this.reverbConvolver);
    this.delayWet.connect(this.reverbConvolver);

    this.reverbConvolver.connect(this.reverbWet);

    this.reverbDry.connect(this.masterGain);
    this.reverbWet.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  private updateDistortionCurve(drive: number) {
    if (!this.waveshaperNode || !this.ctx) return;
    if (drive <= 0.01) {
      this.waveshaperNode.curve = null;
      return;
    }
    const k = drive * 100;
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.waveshaperNode.curve = curve;
  }

  private createSyntheticImpulse(durationSecs: number) {
    if (!this.ctx || !this.reverbConvolver) return;
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * durationSecs));
    const impulse = this.ctx.createBuffer(2, len, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < len; i++) {
      const decay = Math.exp(-i / (rate * (durationSecs / 3)));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    this.reverbConvolver.buffer = impulse;
  }

  public updateFx(fx: Partial<FxSettings>) {
    this.ensureContext();
    if (fx.masterVolume !== undefined) {
      this.fx.masterVolume = fx.masterVolume;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(fx.masterVolume, this.ctx.currentTime);
      }
    }
    if (fx.filter && this.filterNode && this.ctx) {
      this.fx.filter = { ...this.fx.filter, ...fx.filter };
      this.filterNode.type = this.fx.filter.type;
      this.filterNode.frequency.setValueAtTime(
        this.fx.filter.enabled ? this.fx.filter.cutoff : 20000,
        this.ctx.currentTime
      );
      this.filterNode.Q.setValueAtTime(this.fx.filter.resonance, this.ctx.currentTime);
    }
    if (fx.distortion && this.ctx) {
      this.fx.distortion = { ...this.fx.distortion, ...fx.distortion };
      this.updateDistortionCurve(this.fx.distortion.enabled ? this.fx.distortion.drive : 0);
    }
    if (fx.delay && this.ctx) {
      this.fx.delay = { ...this.fx.delay, ...fx.delay };
      if (this.delayNode) this.delayNode.delayTime.value = this.fx.delay.timeSecs;
      if (this.delayFeedback) this.delayFeedback.gain.value = this.fx.delay.feedback;
      if (this.delayWet) this.delayWet.gain.value = this.fx.delay.enabled ? this.fx.delay.wet : 0;
    }
    if (fx.reverb && this.ctx) {
      this.fx.reverb = { ...this.fx.reverb, ...fx.reverb };
      if (this.reverbWet) this.reverbWet.gain.value = this.fx.reverb.enabled ? this.fx.reverb.wet : 0;
      this.createSyntheticImpulse(this.fx.reverb.size);
    }
  }

  public noteOn(midiNote: number, velocity = 0.9, instrument: InstrumentType = "piano") {
    const ctx = this.ensureContext();
    const dest = this.waveshaperNode ?? ctx.destination;

    this.noteOff(midiNote);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const now = ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1.0, velocity));

    const voiceGain = ctx.createGain();
    voiceGain.connect(dest);

    const oscillators: OscillatorNode[] = [];

    switch (instrument) {
      case "piano": {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();

        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2, now);
        osc3.type = "sine";
        osc3.frequency.setValueAtTime(freq * 3, now);

        voiceGain.gain.setValueAtTime(vel * 0.7, now);
        voiceGain.gain.exponentialRampToValueAtTime(vel * 0.35, now + 0.35);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        osc3.connect(voiceGain);
        [osc1, osc2, osc3].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      case "rhodes": {
        const oscBody = ctx.createOscillator();
        const oscBell = ctx.createOscillator();
        oscBody.type = "sine";
        oscBody.frequency.setValueAtTime(freq, now);
        oscBell.type = "sine";
        oscBell.frequency.setValueAtTime(freq * 4, now);

        voiceGain.gain.setValueAtTime(vel * 0.8, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

        oscBody.connect(voiceGain);
        oscBell.connect(voiceGain);
        [oscBody, oscBell].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      case "lead": {
        const saw1 = ctx.createOscillator();
        const saw2 = ctx.createOscillator();
        const saw3 = ctx.createOscillator();
        saw1.type = "sawtooth";
        saw1.frequency.setValueAtTime(freq, now);
        saw1.detune.setValueAtTime(-12, now);
        saw2.type = "sawtooth";
        saw2.frequency.setValueAtTime(freq, now);
        saw3.type = "sawtooth";
        saw3.frequency.setValueAtTime(freq, now);
        saw3.detune.setValueAtTime(12, now);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(6000, now);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        filter.Q.value = 3.5;

        saw1.connect(filter);
        saw2.connect(filter);
        saw3.connect(filter);
        filter.connect(voiceGain);

        voiceGain.gain.setValueAtTime(vel * 0.6, now);
        voiceGain.gain.exponentialRampToValueAtTime(vel * 0.4, now + 0.1);
        [saw1, saw2, saw3].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      case "bass": {
        const subOsc = ctx.createOscillator();
        subOsc.type = "sine";
        subOsc.frequency.setValueAtTime(freq * 1.5, now);
        subOsc.frequency.exponentialRampToValueAtTime(freq, now + 0.025);

        voiceGain.gain.setValueAtTime(vel * 0.9, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

        subOsc.connect(voiceGain);
        subOsc.start(now);
        oscillators.push(subOsc);
        break;
      }

      case "organ": {
        const harm1 = ctx.createOscillator();
        const harm2 = ctx.createOscillator();
        const harm3 = ctx.createOscillator();
        harm1.type = "sine";
        harm1.frequency.setValueAtTime(freq, now);
        harm2.type = "sine";
        harm2.frequency.setValueAtTime(freq * 2, now);
        harm3.type = "triangle";
        harm3.frequency.setValueAtTime(freq * 3, now);

        voiceGain.gain.setValueAtTime(vel * 0.7, now);
        voiceGain.gain.exponentialRampToValueAtTime(vel * 0.5, now + 0.08);

        harm1.connect(voiceGain);
        harm2.connect(voiceGain);
        harm3.connect(voiceGain);
        [harm1, harm2, harm3].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      case "pluck": {
        const pluckOsc = ctx.createOscillator();
        pluckOsc.type = "sawtooth";
        pluckOsc.frequency.setValueAtTime(freq, now);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(4500, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + 0.18);

        pluckOsc.connect(filter);
        filter.connect(voiceGain);

        voiceGain.gain.setValueAtTime(vel * 0.8, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        pluckOsc.start(now);
        oscillators.push(pluckOsc);
        break;
      }

      case "strings": {
        const str1 = ctx.createOscillator();
        const str2 = ctx.createOscillator();
        str1.type = "sawtooth";
        str1.frequency.setValueAtTime(freq, now);
        str1.detune.setValueAtTime(-8, now);
        str2.type = "sawtooth";
        str2.frequency.setValueAtTime(freq, now);
        str2.detune.setValueAtTime(8, now);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2200, now);

        str1.connect(filter);
        str2.connect(filter);
        filter.connect(voiceGain);

        voiceGain.gain.setValueAtTime(0.001, now);
        voiceGain.gain.linearRampToValueAtTime(vel * 0.5, now + 0.15);
        [str1, str2].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      // TRADISIONAL SUNDA: Suling Sunda Degung
      case "sundanese_suling": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        // LFO vibrato alami 5.2 Hz
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5.2;
        lfoGain.gain.value = 6.0;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        oscillators.push(lfo);

        // Filter udara bambu
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq * 1.5;
        filter.Q.value = 2.0;

        osc.connect(filter);
        filter.connect(voiceGain);

        voiceGain.gain.setValueAtTime(0.001, now);
        voiceGain.gain.linearRampToValueAtTime(vel * 0.75, now + 0.08);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

        osc.start(now);
        oscillators.push(osc);
        break;
      }

      // TRADISIONAL SUNDA: Angklung Bambu
      case "angklung": {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2, now); // Tabung oktaf ganda

        voiceGain.gain.setValueAtTime(vel * 0.85, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        [osc1, osc2].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      // TRADISIONAL JAWA: Gamelan Saron / Bonang
      case "gamelan_saron": {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freq, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2.76, now); // Inharmonic bronze partial
        osc3.type = "sine";
        osc3.frequency.setValueAtTime(freq * 5.40, now);

        voiceGain.gain.setValueAtTime(vel * 0.85, now);
        voiceGain.gain.exponentialRampToValueAtTime(vel * 0.3, now + 0.15);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        osc3.connect(voiceGain);
        [osc1, osc2, osc3].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      // TRADISIONAL JAWA: Gong Ageng
      case "gamelan_gong": {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freq, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq + 2.5, now); // Beating shimmer 2.5 Hz

        voiceGain.gain.setValueAtTime(vel * 0.95, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        [osc1, osc2].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      // TRADISIONAL JEPANG: Koto
      case "koto": {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2, now);

        voiceGain.gain.setValueAtTime(vel * 0.8, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        [osc1, osc2].forEach((o) => { o.start(now); oscillators.push(o); });
        break;
      }

      // TRADISIONAL JEPANG: Shamisen
      case "shamisen": {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now);

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq * 2.5;
        filter.Q.value = 1.5;

        osc.connect(filter);
        filter.connect(voiceGain);

        voiceGain.gain.setValueAtTime(vel * 0.9, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc.start(now);
        oscillators.push(osc);
        break;
      }
    }

    this.activeVoices.set(midiNote, {
      stop: () => {
        const stopTime = ctx.currentTime + 0.08;
        try {
          voiceGain.gain.setValueAtTime(voiceGain.gain.value, ctx.currentTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
          oscillators.forEach((o) => {
            try { o.stop(stopTime + 0.02); } catch { /* ignore */ }
          });
        } catch { /* ignore */ }
      },
    });
  }

  public noteOff(midiNote: number) {
    const voice = this.activeVoices.get(midiNote);
    if (voice) {
      voice.stop();
      this.activeVoices.delete(midiNote);
    }
  }

  public playDrum(drum: DrumType, velocity = 0.95) {
    const ctx = this.ensureContext();
    const dest = this.waveshaperNode ?? ctx.destination;
    const now = ctx.currentTime;
    const vel = Math.max(0.1, Math.min(1.0, velocity));

    const gain = ctx.createGain();
    gain.connect(dest);

    switch (drum) {
      case "kick": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

        gain.gain.setValueAtTime(vel * 1.1, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case "snare": {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);

        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.22), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 1100;

        gain.gain.setValueAtTime(vel * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

        osc.connect(gain);
        noise.connect(filter);
        filter.connect(gain);

        osc.start(now);
        noise.start(now);
        osc.stop(now + 0.22);
        noise.stop(now + 0.22);
        break;
      }

      case "clap": {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.28), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1200;
        filter.Q.value = 1.2;

        gain.gain.setValueAtTime(vel * 0.85, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + 0.28);
        break;
      }

      case "hihat_closed": {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 7500;

        gain.gain.setValueAtTime(vel * 0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + 0.08);
        break;
      }

      case "hihat_open": {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 6500;

        gain.gain.setValueAtTime(vel * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + 0.4);
        break;
      }

      case "tom": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.12);

        gain.gain.setValueAtTime(vel * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }

      case "crash": {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 4500;
        filter.Q.value = 0.8;

        gain.gain.setValueAtTime(vel * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + 1.2);
        break;
      }

      // KENDANG SUNDA & JAWA: Tung (Slap Melingkar)
      case "kendang_tung": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);

        gain.gain.setValueAtTime(vel * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }

      // KENDANG SUNDA: Pak / Tepak Jaipong
      case "kendang_pak": {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.05);

        gain.gain.setValueAtTime(vel * 0.95, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }

      // KENDANG SUNDA: Bem (Bass Kulanter)
      case "kendang_bem": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);

        gain.gain.setValueAtTime(vel * 1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.48);
        break;
      }

      // KENDANG KOPLO: Dho / Dut Drop
      case "kendang_dho": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);

        gain.gain.setValueAtTime(vel * 1.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.52);
        break;
      }

      // JEPANG: Taiko O-Daiko Heavy
      case "taiko_heavy": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + 0.15);

        gain.gain.setValueAtTime(vel * 1.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.68);
        break;
      }

      // JEPANG: Taiko Rimshot Bachi
      case "taiko_rim": {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.04);

        gain.gain.setValueAtTime(vel * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.14);
        break;
      }
    }
  }

  public async renderPatternToWavBlob(pattern: BeatPattern, bars = 2): Promise<Blob> {
    const sampleRate = 44100;
    const secondsPerBeat = 60 / pattern.bpm;
    const stepDuration = secondsPerBeat / 4;
    const totalSteps = (pattern.stepCount || 16) * bars;
    const totalDuration = totalSteps * stepDuration + 0.5;

    const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * totalDuration), sampleRate);
    const stepLen = pattern.stepCount || 16;

    for (let s = 0; s < totalSteps; s++) {
      const stepIdx = s % stepLen;
      let stepTime = s * stepDuration;

      if (stepIdx % 2 === 1) {
        stepTime += stepDuration * pattern.swing * 0.6;
      }

      if (pattern.tracks.kick[stepIdx]) this.renderDrumOffline(offlineCtx, "kick", stepTime);
      if (pattern.tracks.snare[stepIdx]) this.renderDrumOffline(offlineCtx, "snare", stepTime);
      if (pattern.tracks.clap[stepIdx]) this.renderDrumOffline(offlineCtx, "clap", stepTime);
      if (pattern.tracks.hihat_closed[stepIdx]) this.renderDrumOffline(offlineCtx, "hihat_closed", stepTime);
      if (pattern.tracks.hihat_open[stepIdx]) this.renderDrumOffline(offlineCtx, "hihat_open", stepTime);
      if (pattern.tracks.percussion && pattern.tracks.percussion[stepIdx]) {
        this.renderDrumOffline(offlineCtx, "kendang_tung", stepTime);
      }

      const bassStep = pattern.tracks.bass[stepIdx];
      if (bassStep?.active) {
        this.renderSynthOffline(offlineCtx, bassStep.note, "bass", stepTime);
      }

      const melStep = pattern.tracks.melody[stepIdx];
      if (melStep?.active) {
        this.renderSynthOffline(offlineCtx, melStep.note, pattern.instrument, stepTime);
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
  }

  private renderDrumOffline(ctx: BaseAudioContext, drum: DrumType, time: number) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (drum === "kick") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.38);
    } else if (drum === "snare") {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(190, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);
      gain.gain.setValueAtTime(0.85, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.22);
    } else {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(260, time);
      osc.frequency.exponentialRampToValueAtTime(120, time + 0.08);
      gain.gain.setValueAtTime(0.75, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.22);
    }
  }

  private renderSynthOffline(
    ctx: BaseAudioContext,
    midiNote: number,
    instrument: InstrumentType,
    time: number
  ) {
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = instrument === "piano" ? "triangle" : instrument === "bass" ? "sine" : "sawtooth";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.75);

    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.8);
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length * blockAlign;
  const bufferArray = new ArrayBuffer(44 + length);
  const view = new DataView(bufferArray);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(view, 36, "data");
  view.setUint32(40, length, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([bufferArray], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Preset Beats FL Studio & Tradisional Bawaan
export const FL_STUDIO_PRESETS: BeatPattern[] = [
  {
    name: "Sunda Degung Jaipong Trap (128 BPM)",
    bpm: 128,
    swing: 0.12,
    stepCount: 16,
    instrument: "sundanese_suling",
    tracks: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      clap: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      percussion: [false, true, false, true, false, false, true, false, false, true, false, true, false, true, false, false],
      bass: [
        { active: true, note: 36 }, // C2
        { active: false, note: 36 },
        { active: true, note: 37 }, // C#2 (Pelog Da-Mi)
        { active: false, note: 37 },
        { active: true, note: 41 }, // F2
        { active: false, note: 41 },
        { active: true, note: 43 }, // G2
        { active: false, note: 43 },
        { active: true, note: 44 }, // G#2
        { active: false, note: 44 },
        { active: true, note: 41 },
        { active: false, note: 41 },
        { active: true, note: 37 },
        { active: false, note: 37 },
        { active: true, note: 36 },
        { active: false, note: 36 },
      ],
      melody: [
        { active: true, note: 60 }, // Da (C4)
        { active: false, note: 60 },
        { active: true, note: 61 }, // Mi (C#4)
        { active: false, note: 61 },
        { active: true, note: 65 }, // Na (F4)
        { active: false, note: 65 },
        { active: true, note: 67 }, // Ti (G4)
        { active: false, note: 67 },
        { active: true, note: 68 }, // La (G#4)
        { active: false, note: 68 },
        { active: true, note: 67 }, // Ti
        { active: false, note: 67 },
        { active: true, note: 65 }, // Na
        { active: false, note: 65 },
        { active: true, note: 61 }, // Mi
        { active: false, note: 61 },
      ],
    },
  },
  {
    name: "Jawa Gamelan Rave / Koplo DJ (135 BPM)",
    bpm: 135,
    swing: 0.15,
    stepCount: 16,
    instrument: "gamelan_saron",
    tracks: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
      hihat_open: [false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, true],
      percussion: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      bass: [
        { active: true, note: 33 }, // A1
        { active: false, note: 33 },
        { active: true, note: 35 }, // B1
        { active: false, note: 35 },
        { active: true, note: 38 }, // D2
        { active: false, note: 38 },
        { active: true, note: 40 }, // E2
        { active: false, note: 40 },
        { active: true, note: 42 }, // F#2
        { active: false, note: 42 },
        { active: true, note: 40 },
        { active: false, note: 40 },
        { active: true, note: 38 },
        { active: false, note: 38 },
        { active: true, note: 35 },
        { active: false, note: 35 },
      ],
      melody: [
        { active: true, note: 69 }, // 1 Slendro
        { active: false, note: 69 },
        { active: true, note: 71 }, // 2 Slendro
        { active: false, note: 71 },
        { active: true, note: 74 }, // 3 Slendro
        { active: false, note: 74 },
        { active: true, note: 76 }, // 5 Slendro
        { active: false, note: 76 },
        { active: true, note: 78 }, // 6 Slendro
        { active: false, note: 78 },
        { active: true, note: 76 },
        { active: false, note: 76 },
        { active: true, note: 74 },
        { active: false, note: 74 },
        { active: true, note: 71 },
        { active: false, note: 71 },
      ],
    },
  },
  {
    name: "Japan Cyber Taiko & Koto (140 BPM)",
    bpm: 140,
    swing: 0.05,
    stepCount: 16,
    instrument: "koto",
    tracks: {
      kick: [true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false],
      snare: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      clap: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
      percussion: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false],
      bass: [
        { active: true, note: 33 }, // A1
        { active: false, note: 33 },
        { active: true, note: 35 }, // B1
        { active: false, note: 35 },
        { active: true, note: 36 }, // C2
        { active: false, note: 36 },
        { active: true, note: 40 }, // E2
        { active: false, note: 40 },
        { active: true, note: 41 }, // F2
        { active: false, note: 41 },
        { active: true, note: 40 },
        { active: false, note: 40 },
        { active: true, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 35 },
        { active: false, note: 35 },
      ],
      melody: [
        { active: true, note: 69 }, // A4
        { active: true, note: 71 }, // B4
        { active: true, note: 72 }, // C5
        { active: false, note: 72 },
        { active: true, note: 76 }, // E5
        { active: false, note: 76 },
        { active: true, note: 77 }, // F5 (Hirajoshi)
        { active: false, note: 77 },
        { active: true, note: 76 }, // E5
        { active: false, note: 76 },
        { active: true, note: 72 }, // C5
        { active: false, note: 72 },
        { active: true, note: 71 }, // B4
        { active: false, note: 71 },
        { active: true, note: 69 }, // A4
        { active: false, note: 69 },
      ],
    },
  },
  {
    name: "13-Step Polyrhythmic Odd Groove (126 BPM)",
    bpm: 126,
    swing: 0.08,
    stepCount: 13, // 13-STEP ODD METER!
    instrument: "pluck",
    tracks: {
      kick: [true, false, false, true, false, false, true, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, true, false, false],
      clap: [false, false, false, false, false, false, false, false, false, false, true, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, true, false, false, true, false, false, true, false, false, true, false],
      percussion: [false, true, false, false, true, false, false, true, false, false, true, false, false],
      bass: [
        { active: true, note: 36 }, // C2
        { active: false, note: 36 },
        { active: true, note: 39 }, // D#2
        { active: false, note: 39 },
        { active: true, note: 41 }, // F2
        { active: false, note: 41 },
        { active: true, note: 43 }, // G2
        { active: false, note: 43 },
        { active: true, note: 46 }, // A#2
        { active: false, note: 46 },
        { active: true, note: 43 },
        { active: false, note: 43 },
        { active: true, note: 39 },
      ],
      melody: [
        { active: true, note: 60 },
        { active: true, note: 63 },
        { active: false, note: 63 },
        { active: true, note: 67 },
        { active: false, note: 67 },
        { active: true, note: 70 },
        { active: false, note: 70 },
        { active: true, note: 72 },
        { active: false, note: 72 },
        { active: true, note: 70 },
        { active: false, note: 70 },
        { active: true, note: 67 },
        { active: true, note: 63 },
      ],
    },
  },
  {
    name: "12-Step Afrobeat Triplet (120 BPM)",
    bpm: 120,
    swing: 0.18,
    stepCount: 12, // 12-STEP TRIPLET / WALTZ!
    instrument: "organ",
    tracks: {
      kick: [true, false, false, true, false, false, true, false, false, true, false, false],
      snare: [false, false, false, false, false, false, true, false, false, false, false, false],
      clap: [false, false, false, false, false, false, true, false, false, false, false, false],
      hihat_closed: [true, false, true, true, false, true, true, false, true, true, false, true],
      hihat_open: [false, false, true, false, false, true, false, false, true, false, false, true],
      percussion: [false, true, false, false, true, false, false, true, false, false, true, false],
      bass: [
        { active: true, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 41 },
        { active: false, note: 41 },
        { active: false, note: 41 },
        { active: true, note: 43 },
        { active: false, note: 43 },
        { active: false, note: 43 },
        { active: true, note: 41 },
        { active: false, note: 41 },
        { active: true, note: 39 },
      ],
      melody: [
        { active: true, note: 60 },
        { active: false, note: 60 },
        { active: true, note: 63 },
        { active: true, note: 65 },
        { active: false, note: 65 },
        { active: true, note: 67 },
        { active: true, note: 72 },
        { active: false, note: 72 },
        { active: true, note: 70 },
        { active: true, note: 67 },
        { active: false, note: 67 },
        { active: true, note: 63 },
      ],
    },
  },
  {
    name: "House 4-on-the-Floor (128 BPM)",
    bpm: 128,
    swing: 0.1,
    stepCount: 16,
    instrument: "piano",
    tracks: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      hihat_open: [false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, true],
      percussion: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      bass: [
        { active: true, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 39 },
        { active: false, note: 39 },
        { active: true, note: 41 },
        { active: false, note: 41 },
        { active: false, note: 41 },
        { active: true, note: 43 },
        { active: false, note: 43 },
        { active: true, note: 41 },
        { active: false, note: 41 },
        { active: false, note: 41 },
      ],
      melody: [
        { active: true, note: 60 },
        { active: false, note: 60 },
        { active: true, note: 63 },
        { active: false, note: 63 },
        { active: true, note: 67 },
        { active: false, note: 67 },
        { active: true, note: 72 },
        { active: false, note: 72 },
        { active: true, note: 70 },
        { active: false, note: 70 },
        { active: true, note: 67 },
        { active: false, note: 67 },
        { active: true, note: 63 },
        { active: false, note: 63 },
        { active: true, note: 65 },
        { active: false, note: 65 },
      ],
    },
  },
  {
    name: "EDM Festival Anthem (130 BPM)",
    bpm: 130,
    swing: 0.05,
    stepCount: 16,
    instrument: "lead",
    tracks: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      percussion: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      bass: [
        { active: true, note: 33 },
        { active: true, note: 33 },
        { active: false, note: 33 },
        { active: true, note: 33 },
        { active: true, note: 33 },
        { active: true, note: 33 },
        { active: false, note: 33 },
        { active: true, note: 33 },
        { active: true, note: 29 },
        { active: true, note: 29 },
        { active: false, note: 29 },
        { active: true, note: 29 },
        { active: true, note: 31 },
        { active: true, note: 31 },
        { active: false, note: 31 },
        { active: true, note: 31 },
      ],
      melody: [
        { active: true, note: 69 },
        { active: false, note: 69 },
        { active: true, note: 69 },
        { active: true, note: 72 },
        { active: false, note: 72 },
        { active: true, note: 76 },
        { active: false, note: 76 },
        { active: true, note: 74 },
        { active: true, note: 72 },
        { active: false, note: 72 },
        { active: true, note: 69 },
        { active: false, note: 69 },
        { active: true, note: 71 },
        { active: false, note: 71 },
        { active: true, note: 67 },
        { active: false, note: 67 },
      ],
    },
  },
  {
    name: "Blank Canvas (Buat Sendiri dari Nol)",
    bpm: 128,
    swing: 0,
    stepCount: 16,
    instrument: "piano",
    tracks: {
      kick: Array(32).fill(false),
      snare: Array(32).fill(false),
      clap: Array(32).fill(false),
      hihat_closed: Array(32).fill(false),
      hihat_open: Array(32).fill(false),
      percussion: Array(32).fill(false),
      bass: Array(32).fill(null).map(() => ({ active: false, note: 36 })),
      melody: Array(32).fill(null).map(() => ({ active: false, note: 60 })),
    },
  },
];

export const synthEngine = new SynthAudioEngine();
