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
  supportedChannels: number[];
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
  /** Jumlah channel output; null/kosong = auto (stereo paling kompatibel). */
  channels?: number | null;
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

export interface LibraryTrack {
  id: number;
  filePath: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  year: number | null;
  bpm: number | null;
  keyName: string | null;
  durationSecs: number;
  rating: number;
  color: string | null;
  playCount: number;
  dateAdded: string;
  analyzed: boolean;
  loudnessLufs: number | null;
}

export interface CrateItem {
  id: number;
  name: string;
  color: string | null;
  trackCount: number;
}

export interface SmartFilter {
  minBpm?: number | null;
  maxBpm?: number | null;
  keyName?: string | null;
  genre?: string | null;
  minRating?: number | null;
}

export interface PlaylistItem {
  id: number;
  name: string;
  isSmart: boolean;
  smartFilter?: SmartFilter | null;
  trackCount: number;
}

export interface HistoryItem {
  id: number;
  trackId: number;
  title: string;
  artist: string;
  deckSlot: number;
  playedAt: string;
  durationSecs: number;
}

export interface ScanProgress {
  isScanning: boolean;
  isAnalyzing: boolean;
  scannedFiles: number;
  totalFiles: number;
  analyzedTracks: number;
  totalAnalyze: number;
  currentFile?: string | null;
}

export interface PreviewStatus {
  isPlaying: boolean;
  currentPath: string | null;
  positionSecs: number;
  durationSecs: number;
}

export interface TrackQuery {
  search?: string | null;
  sortColumn?: string | null;
  sortDescending?: boolean | null;
  crateId?: number | null;
  playlistId?: number | null;
  limit?: number | null;
}

// ---- MIDI & Keyboard (Fase 9) ----

export interface MidiPortInfo {
  id: number;
  name: string;
}

export type MidiMessageType = "noteOn" | "noteOff" | "controlChange" | "pitchBend";

export interface MidiEvent {
  channel: number;
  messageType: MidiMessageType;
  control: number;
  value: number;
}

export type JogWheelMode =
  | "relativeTwoComp"
  | "relativeBinaryOffset"
  | "relativeSignedBit"
  | "absolute";

export type DjAction =
  | { type: "deckPlay"; payload: { deck: number } }
  | { type: "deckCue"; payload: { deck: number } }
  | { type: "deckSync"; payload: { deck: number } }
  | { type: "deckPitch"; payload: { deck: number } }
  | { type: "deckPitchBend"; payload: { deck: number; direction: number } }
  | { type: "deckJog"; payload: { deck: number; mode: JogWheelMode } }
  | { type: "deckHotCue"; payload: { deck: number; index: number } }
  | { type: "deckLoopToggle"; payload: { deck: number } }
  | { type: "deckLoopHalf"; payload: { deck: number } }
  | { type: "deckLoopDouble"; payload: { deck: number } }
  | { type: "deckBeatJump"; payload: { deck: number; beats: number } }
  | { type: "mixerFader"; payload: { deck: number } }
  | { type: "mixerCrossfader" }
  | { type: "mixerEqLow"; payload: { deck: number } }
  | { type: "mixerEqMid"; payload: { deck: number } }
  | { type: "mixerEqHigh"; payload: { deck: number } }
  | { type: "mixerFilter"; payload: { deck: number } }
  | { type: "mixerGain"; payload: { deck: number } }
  | { type: "mixerPfl"; payload: { deck: number } }
  | { type: "mixerMasterVolume" }
  | { type: "mixerCueVolume" }
  | { type: "mixerCueMix" }
  | { type: "samplerPad"; payload: { pad: number } }
  | { type: "samplerBankSelect"; payload: { bank: number } }
  | { type: "samplerVolume" }
  | { type: "fxToggle"; payload: { chain: number; slot: number } }
  | { type: "fxWetDry"; payload: { chain: number; slot: number } }
  | { type: "browserScroll"; payload: { delta: number } }
  | { type: "browserLoadDeck"; payload: { deck: number } };

export interface MidiMapping {
  id: string;
  channel: number;
  messageType: MidiMessageType;
  control: number;
  action: DjAction;
  description?: string | null;
}

export interface MidiLearnStatus {
  isLearning: boolean;
  targetAction?: DjAction | null;
  lastEvent?: MidiEvent | null;
}

export interface MidiStatus {
  connectedInput: string | null;
  connectedOutput: string | null;
  isLearning: boolean;
  activePreset: string;
  mappingCount: number;
  lastEvent?: MidiEvent | null;
}

export interface KeyboardBinding {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  action: DjAction;
  description?: string | null;
}

// ---- Skin & Layout Engine (Fase 10) ----

export type PlatterSize = "compact" | "standard" | "large-battle";

export type WaveformPosition =
  | "top-stacked"
  | "deck-integrated"
  | "bottom"
  | "hidden";

export type WaveformOrientation = "horizontal" | "vertical";

export type MixerPosition = "center" | "compact-bottom" | "split";

export interface SkinMetadata {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  previewImage?: string | null;
}

export interface SkinTheme {
  primaryColor: string;
  accentDeckA: string;
  accentDeckB: string;
  accentDeckC?: string | null;
  accentDeckD?: string | null;
  backgroundColor: string;
  surfaceColor: string;
  panelBorderColor: string;
  textColor: string;
  fontFamily?: string | null;
  customCss?: string | null;
}

export interface PlatterStyle {
  size: PlatterSize;
  vinylTexture: boolean;
  centerDisplay: boolean;
}

export interface WaveformLayout {
  position: WaveformPosition;
  orientation: WaveformOrientation;
  heightPx: number;
  showBeatgrid: boolean;
}

export interface MixerLayout {
  position: MixerPosition;
  channelCount: number;
  vuMeterStyle: string;
  crossfaderHeightPx: number;
}

export interface SkinLayout {
  deckCount: number;
  waveform: WaveformLayout;
  platter: PlatterStyle;
  mixer: MixerLayout;
  lowerPanelDefault: string;
  showPhaseStrip: boolean;
  showScratchPads: boolean;
}

export interface SkinManifest {
  metadata: SkinMetadata;
  theme: SkinTheme;
  layout: SkinLayout;
}

// ---- Recording & Live Streaming Broadcast (Fase 11) ------------------------

export type RecordFormat = "wav-16" | "wav-24" | "wav-32-float";

export interface RecorderStatus {
  isRecording: boolean;
  isPaused: boolean;
  filePath: string | null;
  format: RecordFormat;
  durationSecs: number;
  bytesWritten: number;
  framesRecorded: number;
  peakL: number;
  peakR: number;
  splitCount: number;
}

export type BroadcastProtocol = "icecast2" | "shoutcast";

export interface BroadcastConfig {
  server: string;
  mount: string;
  password: string;
  protocol: BroadcastProtocol;
  stationName: string;
  genre: string;
  description: string;
  bitrateKbps: number;
  isPublic: boolean;
}

export interface BroadcastStatus {
  isStreaming: boolean;
  serverUrl: string | null;
  mount: string | null;
  durationSecs: number;
  bytesSent: number;
  lastError: string | null;
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

  // ---- Library, Crates, Playlists & Preview (Fase 8) -----------------------

  getLibraryTracks: (query?: TrackQuery) =>
    invokeCommand<LibraryTrack[]>("get_library_tracks", { query }),

  scanLibraryFolder: (folderPath: string) =>
    invokeCommand<ScanProgress>("scan_library_folder", { folderPath }),

  startBatchAnalyze: (trackIds?: number[]) =>
    invokeCommand<ScanProgress>("start_batch_analyze", { trackIds }),

  getScanProgress: () =>
    invokeCommand<ScanProgress>("get_scan_progress"),

  createCrate: (name: string, color?: string) =>
    invokeCommand<number>("create_crate", { name, color }),

  deleteCrate: (id: number) =>
    invokeCommand<void>("delete_crate", { id }),

  listCrates: () =>
    invokeCommand<CrateItem[]>("list_crates"),

  addTrackToCrate: (crateId: number, trackId: number) =>
    invokeCommand<void>("add_track_to_crate", { crateId, trackId }),

  removeTrackFromCrate: (crateId: number, trackId: number) =>
    invokeCommand<void>("remove_track_from_crate", { crateId, trackId }),

  createPlaylist: (name: string, smartFilter?: SmartFilter) =>
    invokeCommand<number>("create_playlist", { name, smartFilter }),

  deletePlaylist: (id: number) =>
    invokeCommand<void>("delete_playlist", { id }),

  listPlaylists: () =>
    invokeCommand<PlaylistItem[]>("list_playlists"),

  addTrackToPlaylist: (playlistId: number, trackId: number) =>
    invokeCommand<void>("add_track_to_playlist", { playlistId, trackId }),

  removeTrackFromPlaylist: (playlistId: number, trackId: number) =>
    invokeCommand<void>("remove_track_from_playlist", { playlistId, trackId }),

  importPlaylist: (filePath: string) =>
    invokeCommand<number>("import_playlist", { filePath }),

  exportPlaylist: (playlistId: number, destPath: string) =>
    invokeCommand<void>("export_playlist", { playlistId, destPath }),

  updateTrackRating: (trackId: number, rating: number) =>
    invokeCommand<void>("update_track_rating", { trackId, rating }),

  updateTrackColor: (trackId: number, color?: string) =>
    invokeCommand<void>("update_track_color", { trackId, color }),

  deleteLibraryTrack: (trackId: number) =>
    invokeCommand<void>("delete_library_track", { trackId }),

  getLibraryHistory: (limit?: number) =>
    invokeCommand<HistoryItem[]>("get_library_history", { limit }),

  previewPlay: (path: string, startSecs?: number) =>
    invokeCommand<PreviewStatus>("preview_play", { path, startSecs }),

  previewStop: () =>
    invokeCommand<PreviewStatus>("preview_stop"),

  previewSeek: (seconds: number) =>
    invokeCommand<PreviewStatus>("preview_seek", { seconds }),

  getPreviewStatus: () =>
    invokeCommand<PreviewStatus>("get_preview_status"),

  // MIDI & Keyboard (Fase 9)
  listMidiInputs: () => invokeCommand<MidiPortInfo[]>("list_midi_inputs"),
  listMidiOutputs: () => invokeCommand<MidiPortInfo[]>("list_midi_outputs"),
  connectMidiDevice: (inputIndex?: number, outputIndex?: number) =>
    invokeCommand<MidiStatus>("connect_midi_device", { inputIndex, outputIndex }),
  disconnectMidiDevice: () => invokeCommand<MidiStatus>("disconnect_midi_device"),
  getMidiStatus: () => invokeCommand<MidiStatus>("get_midi_status"),
  startMidiLearn: (action: DjAction) =>
    invokeCommand<MidiLearnStatus>("start_midi_learn", { action }),
  cancelMidiLearn: () => invokeCommand<MidiLearnStatus>("cancel_midi_learn"),
  getMidiMappings: () => invokeCommand<MidiMapping[]>("get_midi_mappings"),
  setMidiMapping: (mapping: MidiMapping) =>
    invokeCommand<void>("set_midi_mapping", { mapping }),
  removeMidiMapping: (id: string) =>
    invokeCommand<boolean>("remove_midi_mapping", { id }),
  clearMidiMappings: () => invokeCommand<void>("clear_midi_mappings"),
  loadMidiPreset: (name: string) =>
    invokeCommand<MidiStatus>("load_midi_preset", { name }),
  saveMidiPreset: (name: string) =>
    invokeCommand<MidiStatus>("save_midi_preset", { name }),
  listMidiPresets: () => invokeCommand<string[]>("list_midi_presets"),
  getKeyboardMappings: () =>
    invokeCommand<KeyboardBinding[]>("get_keyboard_mappings"),
  setKeyboardMapping: (binding: KeyboardBinding) =>
    invokeCommand<void>("set_keyboard_mapping", { binding }),
  removeKeyboardMapping: (key: string, ctrl?: boolean, shift?: boolean, alt?: boolean) =>
    invokeCommand<boolean>("remove_keyboard_mapping", { key, ctrl, shift, alt }),
  resetKeyboardMappings: () =>
    invokeCommand<KeyboardBinding[]>("reset_keyboard_mappings"),
  handleKeyboardShortcut: (key: string, ctrl?: boolean, shift?: boolean, alt?: boolean) =>
    invokeCommand<DjAction | null>("handle_keyboard_shortcut", { key, ctrl, shift, alt }),

  // Skin & Layout Engine (Fase 10)
  listSkins: () => invokeCommand<SkinManifest[]>("list_skins"),
  getActiveSkin: () => invokeCommand<SkinManifest>("get_active_skin"),
  setActiveSkin: (skinId: string) =>
    invokeCommand<SkinManifest>("set_active_skin", { skinId }),
  saveCustomSkin: (manifest: SkinManifest) =>
    invokeCommand<SkinManifest>("save_custom_skin", { manifest }),
  deleteSkin: (skinId: string) =>
    invokeCommand<void>("delete_skin", { skinId }),
  exportSkinPack: (skinId: string, destPath: string) =>
    invokeCommand<void>("export_skin_pack", { skinId, destPath }),
  importSkinPack: (zipPath: string) =>
    invokeCommand<SkinManifest>("import_skin_pack", { zipPath }),

  // Recording & Live Streaming Broadcast (Fase 11)
  startRecording: (outputPath?: string, format?: RecordFormat) =>
    invokeCommand<RecorderStatus>("start_recording", { outputPath, format }),
  stopRecording: () => invokeCommand<RecorderStatus>("stop_recording"),
  pauseRecording: () => invokeCommand<RecorderStatus>("pause_recording"),
  resumeRecording: () => invokeCommand<RecorderStatus>("resume_recording"),
  splitRecording: () => invokeCommand<RecorderStatus>("split_recording"),
  getRecorderStatus: () => invokeCommand<RecorderStatus>("get_recorder_status"),
  startBroadcast: (config: BroadcastConfig) =>
    invokeCommand<BroadcastStatus>("start_broadcast", { config }),
  stopBroadcast: () => invokeCommand<BroadcastStatus>("stop_broadcast"),
  getBroadcastStatus: () => invokeCommand<BroadcastStatus>("get_broadcast_status"),
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
