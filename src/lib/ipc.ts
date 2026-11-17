/**
 * Lapisan IPC tipis di atas Tauri `invoke`.
 *
 * Semua tipe di sini harus sinkron dengan DTO Rust di
 * `src-tauri/src/audio/{device,engine,deck,mixer}.rs` (serde camelCase).
 */

export interface AudioDeviceInfo {
  id: string;
  name: string;
  host: string;
  isDefault: boolean;
  maxChannels: number;
  sampleRates: number[];
  sampleFormats: string[];
  bufferFramesMin: number | null;
  bufferFramesMax: number | null;
  defaultSampleRate: number | null;
  defaultChannels: number | null;
}

export interface EngineStatus {
  initialized: boolean;
  running: boolean;
  deviceName: string | null;
  host: string | null;
  sampleRate: number;
  channels: number;
  sampleFormat: string | null;
  bufferFrames: number | null;
  latencyMs: number | null;
  toneEnabled: boolean;
  toneFreqHz: number;
  toneGainDb: number;
  callbacks: number;
  frames: number;
  peak: number;
  masterPeakL: number;
  masterPeakR: number;
  limiterReductionDb: number;
  callbackUsLast: number;
  callbackUsMax: number;
  xruns: number;
  lastError: string | null;
}

export interface StartRequest {
  deviceName?: string | null;
  bufferSize?: number | null;
  sampleRate?: number | null;
  toneFreqHz?: number;
  toneGainDb?: number;
}

export interface ToneParams {
  enabled?: boolean;
  freqHz?: number;
  gainDb?: number;
}

export type DeckId = 0 | 1;

export interface DeckStatus {
  loaded: boolean;
  playing: boolean;
  eof: boolean;
  fileName: string | null;
  codec: string | null;
  durationSecs: number;
  positionSecs: number;
  sourceSampleRate: number;
  engineSampleRate: number;
  channels: number;
  gainDb: number;
  cueSecs: number;
  bufferedMs: number;
  underruns: number;
  peak: number;
  waveformReady: boolean;
  trackId: number;
  speed: number;
  pitchRange: number;
  keylock: boolean;
  semitones: number;
  bpm: number;
  detectedBpm: number;
  bpmConfidence: number;
  firstBeatSecs: number;
  keyName: string | null;
  camelot: string | null;
  keyConfidence: number;
  analysisReady: boolean;
  hotCues: (number | null)[];
  loopActive: boolean;
  loopStartSecs: number;
  loopEndSecs: number;
  loopBeats: number;
  bend: number;
  error: string | null;
}

export type CrossfaderCurve = "smooth" | "constant-power" | "sharp";
export type CrossfaderAssign = "a" | "b" | "thru";

/** Parameter channel strip satu deck. */
export interface ChannelParams {
  lowDb: number;
  midDb: number;
  highDb: number;
  lowKill: boolean;
  midKill: boolean;
  highKill: boolean;
  filter: number;
  fader: number;
  pfl: boolean;
  assign: CrossfaderAssign;
}

/** Parameter mixer; sinkron dengan `audio/mixer.rs` (serde camelCase). */
export interface MixerParams {
  channels: [ChannelParams, ChannelParams];
  crossfader: number;
  crossfaderCurve: CrossfaderCurve;
  crossfaderReverse: boolean;
  masterVolume: number;
  masterBalance: number;
  limiterEnabled: boolean;
  cueVolume: number;
  cueMix: number;
  splitCue: boolean;
}

export type ChannelUpdate = Partial<ChannelParams>;

/** Update parsial: hanya field yang dikirim yang berubah. */
export interface MixerUpdate {
  channelA?: ChannelUpdate;
  channelB?: ChannelUpdate;
  crossfader?: number;
  crossfaderCurve?: CrossfaderCurve;
  crossfaderReverse?: boolean;
  masterVolume?: number;
  masterBalance?: number;
  limiterEnabled?: boolean;
  cueVolume?: number;
  cueMix?: number;
  splitCue?: boolean;
}

export type FxType =
  | "bypass"
  | "delay"
  | "echo"
  | "reverb"
  | "flanger"
  | "phaser"
  | "chorus"
  | "bitcrusher"
  | "gater"
  | "trans"
  | "roll"
  | "brake"
  | "filter-sweep"
  | "noise"
  | "wah";

export interface FxSlotParams {
  fxType: FxType;
  enabled: boolean;
  wet: number;
  p1: number;
  p2: number;
  p3: number;
}

export interface FxChainParams {
  slots: [FxSlotParams, FxSlotParams, FxSlotParams];
}

export interface FxParams {
  chains: [FxChainParams, FxChainParams, FxChainParams];
}

export interface FxSlotUpdate {
  chain: number;
  slot: number;
  fxType?: FxType;
  enabled?: boolean;
  wet?: number;
  p1?: number;
  p2?: number;
  p3?: number;
}

export type AutoDjState =
  | "disabled"
  | "armed"
  | "transitioning"
  | "cooldown";

/** Snapshot Auto DJ; sinkron dengan `audio/autodj.rs`. */
export interface AutoDjStatus {
  enabled: boolean;
  autoStart: boolean;
  beatmatch: boolean;
  crossfadeBeats: number;
  crossfadeSecs: number;
  progress: number;
  state: AutoDjState;
  activeDeck: DeckId;
  nextDeck: DeckId;
  message: string | null;
}

export interface AutoDjUpdate {
  enabled?: boolean;
  autoStart?: boolean;
  beatmatch?: boolean;
  crossfadeBeats?: number;
}

// ---- Sampler / Remixer & Step Sequencer (Fase 7) -------------------------

export type PadMode =
  | "one-shot"
  | "loop"
  | "hold"
  | "stutter"
  | "drum-pad"
  | "cue-pad";

export interface PadDto {
  id: number;
  name: string;
  color: string;
  mode: PadMode;
  volume: number;
  pitchSemitones: number;
  muteGroup: number | null;
  syncBpm: boolean;
  baseBpm: number;
  quantize: boolean;
  loaded: boolean;
  durationSecs: number;
  isPlaying: boolean;
  progress: number;
}

export interface PadUpdate {
  name?: string;
  color?: string;
  mode?: PadMode;
  volume?: number;
  pitchSemitones?: number;
  muteGroup?: number | null;
  syncBpm?: boolean;
  baseBpm?: number;
  quantize?: boolean;
}

export interface SequencerPattern {
  steps: boolean[][];
  velocities: number[][];
}

export interface SequencerStatus {
  running: boolean;
  bpm: number;
  syncToMaster: boolean;
  swing: number;
  currentStep: number;
  currentPattern: number;
  pattern: SequencerPattern;
  padMappings: number[];
}

export interface SequencerUpdate {
  running?: boolean;
  bpm?: number;
  syncToMaster?: boolean;
  swing?: number;
  currentPattern?: number;
  trackStep?: [number, number, boolean];
  padMappings?: number[];
}

export interface SamplerStatus {
  activeBank: number;
  bankNames: string[];
  pads: PadDto[];
  sequencer: SequencerStatus;
  masterVolume: number;
}

/** Pasangan min/max diratakan: [min0, max0, min1, max1, ...]. */
export interface WaveformData {
  trackId: number;
  durationSecs: number;
  peaks: number[];
}

/** True bila UI berjalan di dalam webview Tauri (bukan browser biasa). */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      "Audio engine Rust hanya tersedia di dalam aplikasi Tauri. Jalankan `npm run tauri dev`.",
    );
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export const ipc = {
  listAudioDevices: () =>
    invokeCommand<AudioDeviceInfo[]>("list_audio_devices"),

  getEngineStatus: () => invokeCommand<EngineStatus>("get_engine_status"),

  startAudioEngine: (request: StartRequest) =>
    invokeCommand<EngineStatus>("start_audio_engine", { request }),

  setTestTone: (params: ToneParams) =>
    invokeCommand<EngineStatus>("set_test_tone", { ...params }),

  stopAudioEngine: () => invokeCommand<EngineStatus>("stop_audio_engine"),

  // Deck (Fase 2–5). Semua command deck menerima `deck: 0 | 1`.
  loadTrack: (deck: DeckId, path: string) =>
    invokeCommand<DeckStatus>("load_track", { path, deck }),

  getDeckStatus: (deck: DeckId) =>
    invokeCommand<DeckStatus>("get_deck_status", { deck }),

  deckPlay: (deck: DeckId) => invokeCommand<DeckStatus>("deck_play", { deck }),

  deckPause: (deck: DeckId) =>
    invokeCommand<DeckStatus>("deck_pause", { deck }),

  deckSeek: (deck: DeckId, positionSecs: number) =>
    invokeCommand<DeckStatus>("deck_seek", { positionSecs, deck }),

  deckSetCue: (deck: DeckId) =>
    invokeCommand<DeckStatus>("deck_set_cue", { deck }),

  deckCueJump: (deck: DeckId) =>
    invokeCommand<DeckStatus>("deck_cue_jump", { deck }),

  deckSetGain: (deck: DeckId, gainDb: number) =>
    invokeCommand<DeckStatus>("deck_set_gain", { gainDb, deck }),

  deckSetSpeed: (deck: DeckId, speed: number) =>
    invokeCommand<DeckStatus>("deck_set_speed", { speed, deck }),

  deckSetPitchRange: (deck: DeckId, range: number) =>
    invokeCommand<DeckStatus>("deck_set_pitch_range", { range, deck }),

  deckSetKeylock: (deck: DeckId, enabled: boolean) =>
    invokeCommand<DeckStatus>("deck_set_keylock", { enabled, deck }),

  deckSetSemitones: (deck: DeckId, semitones: number) =>
    invokeCommand<DeckStatus>("deck_set_semitones", { semitones, deck }),

  deckSetBpm: (deck: DeckId, bpm: number) =>
    invokeCommand<DeckStatus>("deck_set_bpm", { bpm, deck }),

  deckSetHotCue: (deck: DeckId, cue: number) =>
    invokeCommand<DeckStatus>("deck_set_hot_cue", { cue, deck }),

  deckTriggerHotCue: (deck: DeckId, cue: number) =>
    invokeCommand<DeckStatus>("deck_trigger_hot_cue", { cue, deck }),

  deckClearHotCue: (deck: DeckId, cue: number) =>
    invokeCommand<DeckStatus>("deck_clear_hot_cue", { cue, deck }),

  deckSetLoop: (
    deck: DeckId,
    startSecs: number,
    endSecs: number,
    beats: number,
  ) =>
    invokeCommand<DeckStatus>("deck_set_loop", {
      startSecs,
      endSecs,
      beats,
      deck,
    }),

  deckExitLoop: (deck: DeckId) =>
    invokeCommand<DeckStatus>("deck_exit_loop", { deck }),

  deckBeatJump: (deck: DeckId, seconds: number) =>
    invokeCommand<DeckStatus>("deck_beat_jump", { seconds, deck }),

  deckSetBend: (deck: DeckId, bend: number) =>
    invokeCommand<DeckStatus>("deck_set_bend", { bend, deck }),

  deckUnload: (deck: DeckId) =>
    invokeCommand<DeckStatus>("deck_unload", { deck }),

  syncDecks: (source: DeckId, target: DeckId) =>
    invokeCommand<DeckStatus>("sync_decks", { source, target }),

  getWaveform: (deck: DeckId, maxPoints = 4096) =>
    invokeCommand<WaveformData | null>("get_waveform", { maxPoints, deck }),

  // Mixer (Fase 4)
  getMixerStatus: () => invokeCommand<MixerParams>("get_mixer_status"),

  setMixer: (update: MixerUpdate) =>
    invokeCommand<MixerParams>("set_mixer", { update }),

  // FX (Fase 6)
  getFxStatus: () => invokeCommand<FxParams>("get_fx_status"),

  setFx: (update: FxSlotUpdate) =>
    invokeCommand<FxParams>("set_fx", { update }),

  // Auto DJ (Fase 6)
  getAutoDjStatus: () => invokeCommand<AutoDjStatus>("get_auto_dj_status"),

  setAutoDj: (update: AutoDjUpdate) =>
    invokeCommand<AutoDjStatus>("set_auto_dj", { update }),

  triggerAutoDj: () => invokeCommand<AutoDjStatus>("auto_dj_trigger"),

  cancelAutoDj: () => invokeCommand<AutoDjStatus>("auto_dj_cancel"),

  // Sampler & Sequencer (Fase 7)
  getSamplerStatus: () => invokeCommand<SamplerStatus>("get_sampler_status"),

  triggerSamplerPad: (pad: number, velocity?: number) =>
    invokeCommand<void>("trigger_sampler_pad", { pad, velocity }),

  releaseSamplerPad: (pad: number) =>
    invokeCommand<void>("release_sampler_pad", { pad }),

  stopSamplerPad: (pad: number) =>
    invokeCommand<void>("stop_sampler_pad", { pad }),

  stopAllSamplerPads: () =>
    invokeCommand<void>("stop_all_sampler_pads"),

  selectSamplerBank: (bank: number) =>
    invokeCommand<SamplerStatus>("select_sampler_bank", { bank }),

  setSamplerVolume: (volume: number) =>
    invokeCommand<SamplerStatus>("set_sampler_volume", { volume }),

  updateSamplerPad: (pad: number, update: PadUpdate) =>
    invokeCommand<SamplerStatus>("update_sampler_pad", { pad, update }),

  loadSamplerPadFile: (pad: number, path: string) =>
    invokeCommand<SamplerStatus>("load_sampler_pad_file", { pad, path }),

  captureDeckToPad: (pad: number, deck?: DeckId, beats?: number) =>
    invokeCommand<SamplerStatus>("capture_deck_to_pad", { pad, deck, beats }),

  updateSequencer: (update: SequencerUpdate) =>
    invokeCommand<SequencerStatus>("update_sequencer", { update }),

  exportSamplePack: (path: string) =>
    invokeCommand<void>("export_sample_pack", { path }),

  importSamplePack: (path: string) =>
    invokeCommand<SamplerStatus>("import_sample_pack", { path }),
};

export const api = ipc;

/** Ubah error apa pun menjadi pesan yang layak ditampilkan. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Terjadi kesalahan yang tidak dikenal.";
}
