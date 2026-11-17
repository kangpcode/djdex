/**
 * DJDeX Web Audio DSP Synthesizer & FL Studio Beat Engine
 *
 * Menyediakan:
 * 1. Multi-instrument polyphonic synth: Acoustic Grand Piano, Rhodes EP, EDM Supersaw Lead,
 *    808 Sub Bass, Club Organ, Pluck, dan Strings/Pad.
 * 2. Dedicated drum synthesizer: Kick, Snare, Clap, Hi-Hat Closed/Open, Tom, Crash.
 * 3. Master FX Rack: Reverb, BPM-synced Delay, Cutoff/Resonance Filter, Distortion/Saturation, Chorus.
 * 4. High-precision 16-step sequencer scheduler berbasis Web Audio clock.
 * 5. WAV Audio Exporter untuk merender loop/melodi langsung ke file audio.
 */

export type InstrumentType =
  | "piano"
  | "rhodes"
  | "lead"
  | "bass"
  | "organ"
  | "pluck"
  | "strings";

export type DrumType =
  | "kick"
  | "snare"
  | "clap"
  | "hihat_closed"
  | "hihat_open"
  | "tom"
  | "crash";

export interface FxSettings {
  reverb: { enabled: boolean; size: number; wet: number };
  delay: { enabled: boolean; timeSecs: number; feedback: number; wet: number };
  filter: { enabled: boolean; cutoff: number; resonance: number; type: BiquadFilterType };
  distortion: { enabled: boolean; drive: number };
  masterVolume: number;
}

export interface SequencerTrackStep {
  active: boolean;
  midiNote?: number; // untuk track instrumen bernada (piano/bass/lead)
  velocity?: number; // 0..1
}

export interface BeatPattern {
  name: string;
  bpm: number;
  swing: number; // 0..0.75
  instrument: InstrumentType;
  tracks: {
    kick: boolean[];
    snare: boolean[];
    clap: boolean[];
    hihat_closed: boolean[];
    hihat_open: boolean[];
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

  // Active voices map: midiNote -> { stop: () => void }
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

    // Master Output Chain:
    // Voices -> Waveshaper -> Filter -> Delay -> Reverb -> MasterGain -> Destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.fx.masterVolume;

    // Filter Node
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = this.fx.filter.type;
    this.filterNode.frequency.value = this.fx.filter.cutoff;
    this.filterNode.Q.value = this.fx.filter.resonance;

    // Distortion Node
    this.waveshaperNode = this.ctx.createWaveShaper();
    this.updateDistortionCurve(this.fx.distortion.drive);

    // Delay Node (Echo)
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

    // Reverb Node (Convolver with algorithmic synthetic impulse)
    this.reverbConvolver = this.ctx.createConvolver();
    this.createSyntheticImpulse(this.fx.reverb.size);
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = this.fx.reverb.enabled ? this.fx.reverb.wet : 0;
    this.reverbDry = this.ctx.createGain();
    this.reverbDry.gain.value = 1.0;

    // Routing:
    // waveshaper -> filter
    this.waveshaperNode.connect(this.filterNode);

    // filter -> delay (dry + wet)
    this.filterNode.connect(this.delayDry);
    this.filterNode.connect(this.delayNode);

    // combine delay outputs -> reverb
    this.delayDry.connect(this.reverbDry);
    this.delayWet.connect(this.reverbDry);
    this.delayDry.connect(this.reverbConvolver);
    this.delayWet.connect(this.reverbConvolver);

    this.reverbConvolver.connect(this.reverbWet);

    // reverb outputs -> masterGain -> destination
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

  /**
   * Mainkan nada instrumen (Polyphonic Note On).
   */
  public noteOn(
    midiNote: number,
    velocity = 0.9,
    instrument: InstrumentType = "piano"
  ) {
    const ctx = this.ensureContext();
    const dest = this.waveshaperNode ?? ctx.destination;

    // Hentikan voice lama jika nada sama masih aktif
    this.noteOff(midiNote);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const now = ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1.0, velocity));

    const voiceGain = ctx.createGain();
    voiceGain.connect(dest);

    const oscillators: OscillatorNode[] = [];

    switch (instrument) {
      case "piano": {
        // Acoustic Grand Piano Synthesizer:
        // Hammer strike + fundamental + 2nd, 3rd, 4th harmonics + warm resonance
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();

        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, now);

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2, now);

        osc3.type = "sine";
        osc3.frequency.setValueAtTime(freq * 3, now);

        // Hammer transient click di 8ms pertama
        const hammerOsc = ctx.createOscillator();
        const hammerGain = ctx.createGain();
        hammerOsc.type = "square";
        hammerOsc.frequency.setValueAtTime(freq * 8, now);
        hammerGain.gain.setValueAtTime(vel * 0.4, now);
        hammerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
        hammerOsc.connect(hammerGain);
        hammerGain.connect(voiceGain);
        hammerOsc.start(now);
        hammerOsc.stop(now + 0.015);

        // Amplitudo envelope piano
        voiceGain.gain.setValueAtTime(vel * 0.7, now);
        voiceGain.gain.exponentialRampToValueAtTime(vel * 0.35, now + 0.35);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        osc3.connect(voiceGain);

        [osc1, osc2, osc3].forEach((o) => {
          o.start(now);
          oscillators.push(o);
        });
        break;
      }

      case "rhodes": {
        // Electric Piano / Rhodes:
        // Pure sine body + bell chime harmonic (x7) + soft tremolo
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

        [oscBody, oscBell].forEach((o) => {
          o.start(now);
          oscillators.push(o);
        });
        break;
      }

      case "lead": {
        // EDM Supersaw Lead (Martin Garrix / Avicii Festival Style):
        // 3 saw waves detuned (-12c, 0, +12c) + plucky lowpass filter envelope
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

        [saw1, saw2, saw3].forEach((o) => {
          o.start(now);
          oscillators.push(o);
        });
        break;
      }

      case "bass": {
        // 808 Sub Bass (Deep club 35-80 Hz sine + pitch punch drop):
        const subOsc = ctx.createOscillator();
        subOsc.type = "sine";
        // Pitch drop dari +12st ke base freq di 20ms pertama
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
        // 90s House Club Organ:
        // Harmonic drawbars (1x, 2x, 3x, 4x)
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

        [harm1, harm2, harm3].forEach((o) => {
          o.start(now);
          oscillators.push(o);
        });
        break;
      }

      case "pluck": {
        // Short Pluck Synth:
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
        // Ambient Synth Strings / Pad:
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

        // Slow attack (150ms)
        voiceGain.gain.setValueAtTime(0.001, now);
        voiceGain.gain.linearRampToValueAtTime(vel * 0.5, now + 0.15);

        [str1, str2].forEach((o) => {
          o.start(now);
          oscillators.push(o);
        });
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
            try {
              o.stop(stopTime + 0.02);
            } catch {
              // already stopped
            }
          });
        } catch {
          // ignore
        }
      },
    });
  }

  /**
   * Hentikan nada (Note Off).
   */
  public noteOff(midiNote: number) {
    const voice = this.activeVoices.get(midiNote);
    if (voice) {
      voice.stop();
      this.activeVoices.delete(midiNote);
    }
  }

  /**
   * Mainkan pukulan drum sintetis (Kick, Snare, Clap, Hi-Hats, Tom, Crash).
   */
  public playDrum(drum: DrumType, velocity = 0.95) {
    const ctx = this.ensureContext();
    const dest = this.waveshaperNode ?? ctx.destination;
    const now = ctx.currentTime;
    const vel = Math.max(0.1, Math.min(1.0, velocity));

    const gain = ctx.createGain();
    gain.connect(dest);

    switch (drum) {
      case "kick": {
        // Punchy 808/909 DJ Kick:
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

        // Click transient
        const click = ctx.createOscillator();
        const clickGain = ctx.createGain();
        click.type = "square";
        click.frequency.setValueAtTime(320, now);
        clickGain.gain.setValueAtTime(vel * 0.5, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);
        click.connect(clickGain);
        clickGain.connect(dest);
        click.start(now);
        click.stop(now + 0.01);

        gain.gain.setValueAtTime(vel * 1.1, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case "snare": {
        // Snare = body tone + highpass noise
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(vel * 0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(oscGain);
        oscGain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.16);

        // Snare wires noise
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

        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + 0.22);
        break;
      }

      case "clap": {
        // Hand Clap: 3 micro bursts lalu decay
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.28), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1200;
        filter.Q.value = 1.2;

        gain.gain.setValueAtTime(vel * 0.6, now);
        gain.gain.setValueAtTime(vel * 0.7, now + 0.012);
        gain.gain.setValueAtTime(vel * 0.85, now + 0.024);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

        noise.connect(filter);
        filter.connect(gain);
        noise.start(now);
        noise.stop(now + 0.28);
        break;
      }

      case "hihat_closed": {
        // Closed Hi-Hat: highpass metallic ring (short decay)
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
        // Open Hi-Hat: metallic shimmer (longer decay)
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
        // Tom Drum
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
        // Crash Cymbal
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
    }
  }

  /**
   * Render seluruh Beat & Piano sequence menjadi file WAV stereo 16-bit.
   */
  public async renderPatternToWavBlob(pattern: BeatPattern, bars = 2): Promise<Blob> {
    const sampleRate = 44100;
    const secondsPerBeat = 60 / pattern.bpm;
    const stepDuration = secondsPerBeat / 4; // 16th note
    const totalSteps = 16 * bars;
    const totalDuration = totalSteps * stepDuration + 0.5; // + ring decay

    const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * totalDuration), sampleRate);

    // Render loop secara presisi ke offline context
    for (let s = 0; s < totalSteps; s++) {
      const stepIdx = s % 16;
      let stepTime = s * stepDuration;

      // Terapkan swing jika step ganjil
      if (stepIdx % 2 === 1) {
        stepTime += stepDuration * pattern.swing * 0.6;
      }

      // 1. Kick
      if (pattern.tracks.kick[stepIdx]) {
        this.renderDrumOffline(offlineCtx, "kick", stepTime);
      }
      // 2. Snare
      if (pattern.tracks.snare[stepIdx]) {
        this.renderDrumOffline(offlineCtx, "snare", stepTime);
      }
      // 3. Clap
      if (pattern.tracks.clap[stepIdx]) {
        this.renderDrumOffline(offlineCtx, "clap", stepTime);
      }
      // 4. Closed Hat
      if (pattern.tracks.hihat_closed[stepIdx]) {
        this.renderDrumOffline(offlineCtx, "hihat_closed", stepTime);
      }
      // 5. Open Hat
      if (pattern.tracks.hihat_open[stepIdx]) {
        this.renderDrumOffline(offlineCtx, "hihat_open", stepTime);
      }
      // 6. Bass Note
      const bassStep = pattern.tracks.bass[stepIdx];
      if (bassStep?.active) {
        this.renderSynthOffline(offlineCtx, bassStep.note, "bass", stepTime);
      }
      // 7. Piano / Lead Melody Note
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

      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1100;

      gain.gain.setValueAtTime(0.85, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

      osc.connect(gain);
      noise.connect(filter);
      filter.connect(gain);

      osc.start(time);
      noise.start(time);
      osc.stop(time + 0.2);
      noise.stop(time + 0.2);
    } else if (drum === "hihat_closed") {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.07), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 7500;

      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

      noise.connect(filter);
      filter.connect(gain);
      noise.start(time);
      noise.stop(time + 0.07);
    } else {
      // Clap / Open hat fallback
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1400;

      gain.gain.setValueAtTime(0.75, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      noise.connect(filter);
      filter.connect(gain);
      noise.start(time);
      noise.stop(time + 0.25);
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

    if (instrument === "piano") {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq, time);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, time);

      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);

      osc1.connect(gain);
      osc2.connect(gain);
      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + 0.85);
      osc2.stop(time + 0.85);
    } else if (instrument === "bass") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * 1.5, time);
      osc.frequency.exponentialRampToValueAtTime(freq, time + 0.02);

      gain.gain.setValueAtTime(0.85, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);

      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.65);
    } else {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.65, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.55);
    }
  }
}

/**
 * Konversi Web Audio AudioBuffer ke format WAV PCM 16-bit Blob.
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length * blockAlign;
  const bufferArray = new ArrayBuffer(44 + length);
  const view = new DataView(bufferArray);

  // RIFF Chunk
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, "WAVE");

  // fmt Subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data Subchunk
  writeString(view, 36, "data");
  view.setUint32(40, length, true);

  // Interleave channels
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

// Preset Beats FL Studio Bawaan
export const FL_STUDIO_PRESETS: BeatPattern[] = [
  {
    name: "House 4-on-the-Floor (128 BPM)",
    bpm: 128,
    swing: 0.1,
    instrument: "piano",
    tracks: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      hihat_open: [false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, true],
      bass: [
        { active: true, note: 36 }, // C2
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 39 }, // D#2
        { active: false, note: 39 },
        { active: true, note: 41 }, // F2
        { active: false, note: 41 },
        { active: false, note: 41 },
        { active: true, note: 43 }, // G2
        { active: false, note: 43 },
        { active: true, note: 41 },
        { active: false, note: 41 },
        { active: false, note: 41 },
      ],
      melody: [
        { active: true, note: 60 }, // C4
        { active: false, note: 60 },
        { active: true, note: 63 }, // D#4
        { active: false, note: 63 },
        { active: true, note: 67 }, // G4
        { active: false, note: 67 },
        { active: true, note: 72 }, // C5
        { active: false, note: 72 },
        { active: true, note: 70 }, // A#4
        { active: false, note: 70 },
        { active: true, note: 67 }, // G4
        { active: false, note: 67 },
        { active: true, note: 63 }, // D#4
        { active: false, note: 63 },
        { active: true, note: 65 }, // F4
        { active: false, note: 65 },
      ],
    },
  },
  {
    name: "EDM Festival Anthem (130 BPM)",
    bpm: 130,
    swing: 0.05,
    instrument: "lead",
    tracks: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      bass: [
        { active: true, note: 33 }, // A1
        { active: true, note: 33 },
        { active: false, note: 33 },
        { active: true, note: 33 },
        { active: true, note: 33 },
        { active: true, note: 33 },
        { active: false, note: 33 },
        { active: true, note: 33 },
        { active: true, note: 29 }, // F1
        { active: true, note: 29 },
        { active: false, note: 29 },
        { active: true, note: 29 },
        { active: true, note: 31 }, // G1
        { active: true, note: 31 },
        { active: false, note: 31 },
        { active: true, note: 31 },
      ],
      melody: [
        { active: true, note: 69 }, // A4
        { active: false, note: 69 },
        { active: true, note: 69 },
        { active: true, note: 72 }, // C5
        { active: false, note: 72 },
        { active: true, note: 76 }, // E5
        { active: false, note: 76 },
        { active: true, note: 74 }, // D5
        { active: true, note: 72 }, // C5
        { active: false, note: 72 },
        { active: true, note: 69 }, // A4
        { active: false, note: 69 },
        { active: true, note: 71 }, // B4
        { active: false, note: 71 },
        { active: true, note: 67 }, // G4
        { active: false, note: 67 },
      ],
    },
  },
  {
    name: "Hip Hop / Trap 808 (140 BPM)",
    bpm: 140,
    swing: 0.15,
    instrument: "bass",
    tracks: {
      kick: [true, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false],
      snare: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      clap: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
      bass: [
        { active: true, note: 36 }, // C2
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: false, note: 36 },
        { active: true, note: 39 }, // D#2
        { active: false, note: 39 },
        { active: false, note: 39 },
        { active: true, note: 34 }, // A#1
        { active: false, note: 34 },
        { active: false, note: 34 },
      ],
      melody: [
        { active: true, note: 60 }, // C4
        { active: false, note: 60 },
        { active: false, note: 60 },
        { active: true, note: 63 }, // D#4
        { active: false, note: 63 },
        { active: false, note: 63 },
        { active: true, note: 67 }, // G4
        { active: false, note: 67 },
        { active: true, note: 65 }, // F4
        { active: false, note: 65 },
        { active: false, note: 65 },
        { active: true, note: 63 }, // D#4
        { active: false, note: 63 },
        { active: true, note: 58 }, // A#3
        { active: false, note: 58 },
        { active: false, note: 58 },
      ],
    },
  },
  {
    name: "Blank Canvas (Buat Sendiri dari Nol)",
    bpm: 128,
    swing: 0,
    instrument: "piano",
    tracks: {
      kick: Array(16).fill(false),
      snare: Array(16).fill(false),
      clap: Array(16).fill(false),
      hihat_closed: Array(16).fill(false),
      hihat_open: Array(16).fill(false),
      bass: Array(16).fill(null).map(() => ({ active: false, note: 36 })),
      melody: Array(16).fill(null).map(() => ({ active: false, note: 60 })),
    },
  },
];

export const synthEngine = new SynthAudioEngine();
