import { useEffect, useState } from "react";
import { useMidiStore } from "../stores/midiStore";
import { IconRefresh } from "./ui/Icons";
import { Panel } from "./ui/Panel";
import type { DjAction, JogWheelMode } from "../lib/ipc";

const ACTION_CATEGORIES: {
  category: string;
  actions: { label: string; action: DjAction }[];
}[] = [
  {
    category: "Deck 1 (Channel 0)",
    actions: [
      { label: "Deck 1: Play / Pause", action: { type: "deckPlay", payload: { deck: 0 } } },
      { label: "Deck 1: Cue Point", action: { type: "deckCue", payload: { deck: 0 } } },
      { label: "Deck 1: Sync BPM/Phase", action: { type: "deckSync", payload: { deck: 0 } } },
      { label: "Deck 1: Tempo / Pitch Slider", action: { type: "deckPitch", payload: { deck: 0 } } },
      {
        label: "Deck 1: Jog Wheel (Relative 2's Comp)",
        action: { type: "deckJog", payload: { deck: 0, mode: "relativeTwoComp" as JogWheelMode } },
      },
      {
        label: "Deck 1: Jog Wheel (Binary Offset)",
        action: { type: "deckJog", payload: { deck: 0, mode: "relativeBinaryOffset" as JogWheelMode } },
      },
      { label: "Deck 1: Pitch Bend -", action: { type: "deckPitchBend", payload: { deck: 0, direction: -1 } } },
      { label: "Deck 1: Pitch Bend +", action: { type: "deckPitchBend", payload: { deck: 0, direction: 1 } } },
      { label: "Deck 1: Auto Loop Toggle", action: { type: "deckLoopToggle", payload: { deck: 0 } } },
      { label: "Deck 1: Loop Half (1/2x)", action: { type: "deckLoopHalf", payload: { deck: 0 } } },
      { label: "Deck 1: Loop Double (2x)", action: { type: "deckLoopDouble", payload: { deck: 0 } } },
      { label: "Deck 1: Hot Cue 1", action: { type: "deckHotCue", payload: { deck: 0, index: 0 } } },
      { label: "Deck 1: Hot Cue 2", action: { type: "deckHotCue", payload: { deck: 0, index: 1 } } },
      { label: "Deck 1: Hot Cue 3", action: { type: "deckHotCue", payload: { deck: 0, index: 2 } } },
      { label: "Deck 1: Hot Cue 4", action: { type: "deckHotCue", payload: { deck: 0, index: 3 } } },
    ],
  },
  {
    category: "Deck 2 (Channel 1)",
    actions: [
      { label: "Deck 2: Play / Pause", action: { type: "deckPlay", payload: { deck: 1 } } },
      { label: "Deck 2: Cue Point", action: { type: "deckCue", payload: { deck: 1 } } },
      { label: "Deck 2: Sync BPM/Phase", action: { type: "deckSync", payload: { deck: 1 } } },
      { label: "Deck 2: Tempo / Pitch Slider", action: { type: "deckPitch", payload: { deck: 1 } } },
      {
        label: "Deck 2: Jog Wheel (Relative 2's Comp)",
        action: { type: "deckJog", payload: { deck: 1, mode: "relativeTwoComp" as JogWheelMode } },
      },
      {
        label: "Deck 2: Jog Wheel (Binary Offset)",
        action: { type: "deckJog", payload: { deck: 1, mode: "relativeBinaryOffset" as JogWheelMode } },
      },
      { label: "Deck 2: Pitch Bend -", action: { type: "deckPitchBend", payload: { deck: 1, direction: -1 } } },
      { label: "Deck 2: Pitch Bend +", action: { type: "deckPitchBend", payload: { deck: 1, direction: 1 } } },
      { label: "Deck 2: Auto Loop Toggle", action: { type: "deckLoopToggle", payload: { deck: 1 } } },
      { label: "Deck 2: Loop Half (1/2x)", action: { type: "deckLoopHalf", payload: { deck: 1 } } },
      { label: "Deck 2: Loop Double (2x)", action: { type: "deckLoopDouble", payload: { deck: 1 } } },
      { label: "Deck 2: Hot Cue 1", action: { type: "deckHotCue", payload: { deck: 1, index: 0 } } },
      { label: "Deck 2: Hot Cue 2", action: { type: "deckHotCue", payload: { deck: 1, index: 1 } } },
      { label: "Deck 2: Hot Cue 3", action: { type: "deckHotCue", payload: { deck: 1, index: 2 } } },
      { label: "Deck 2: Hot Cue 4", action: { type: "deckHotCue", payload: { deck: 1, index: 3 } } },
    ],
  },
  {
    category: "Mixer & Crossfader",
    actions: [
      { label: "Mixer: Crossfader", action: { type: "mixerCrossfader" } },
      { label: "Deck 1: Volume Fader", action: { type: "mixerFader", payload: { deck: 0 } } },
      { label: "Deck 2: Volume Fader", action: { type: "mixerFader", payload: { deck: 1 } } },
      { label: "Deck 1: EQ Low", action: { type: "mixerEqLow", payload: { deck: 0 } } },
      { label: "Deck 1: EQ Mid", action: { type: "mixerEqMid", payload: { deck: 0 } } },
      { label: "Deck 1: EQ High", action: { type: "mixerEqHigh", payload: { deck: 0 } } },
      { label: "Deck 1: Filter", action: { type: "mixerFilter", payload: { deck: 0 } } },
      { label: "Deck 1: Gain / Trim", action: { type: "mixerGain", payload: { deck: 0 } } },
      { label: "Deck 1: Headphone Cue (PFL)", action: { type: "mixerPfl", payload: { deck: 0 } } },
      { label: "Deck 2: EQ Low", action: { type: "mixerEqLow", payload: { deck: 1 } } },
      { label: "Deck 2: EQ Mid", action: { type: "mixerEqMid", payload: { deck: 1 } } },
      { label: "Deck 2: EQ High", action: { type: "mixerEqHigh", payload: { deck: 1 } } },
      { label: "Deck 2: Filter", action: { type: "mixerFilter", payload: { deck: 1 } } },
      { label: "Deck 2: Gain / Trim", action: { type: "mixerGain", payload: { deck: 1 } } },
      { label: "Deck 2: Headphone Cue (PFL)", action: { type: "mixerPfl", payload: { deck: 1 } } },
      { label: "Mixer: Master Volume", action: { type: "mixerMasterVolume" } },
      { label: "Mixer: Headphones Volume", action: { type: "mixerCueVolume" } },
      { label: "Mixer: Headphones Cue/Master Mix", action: { type: "mixerCueMix" } },
    ],
  },
  {
    category: "Sampler & FX",
    actions: [
      { label: "Sampler: Pad 1", action: { type: "samplerPad", payload: { pad: 0 } } },
      { label: "Sampler: Pad 2", action: { type: "samplerPad", payload: { pad: 1 } } },
      { label: "Sampler: Pad 3", action: { type: "samplerPad", payload: { pad: 2 } } },
      { label: "Sampler: Pad 4", action: { type: "samplerPad", payload: { pad: 3 } } },
      { label: "Sampler: Master Volume", action: { type: "samplerVolume" } },
      { label: "FX: Chain 1 Slot 1 Toggle", action: { type: "fxToggle", payload: { chain: 0, slot: 0 } } },
      { label: "FX: Chain 1 Slot 1 Wet/Dry", action: { type: "fxWetDry", payload: { chain: 0, slot: 0 } } },
      { label: "FX: Chain 2 Slot 1 Toggle", action: { type: "fxToggle", payload: { chain: 1, slot: 0 } } },
      { label: "FX: Chain 2 Slot 1 Wet/Dry", action: { type: "fxWetDry", payload: { chain: 1, slot: 0 } } },
    ],
  },
];

export function MidiPanel() {
  const inputs = useMidiStore((s) => s.inputs);
  const outputs = useMidiStore((s) => s.outputs);
  const status = useMidiStore((s) => s.status);
  const mappings = useMidiStore((s) => s.mappings);
  const presets = useMidiStore((s) => s.presets);
  const learnStatus = useMidiStore((s) => s.learnStatus);
  const keyboardBindings = useMidiStore((s) => s.keyboardBindings);
  const activityLogs = useMidiStore((s) => s.activityLogs);
  const isLoading = useMidiStore((s) => s.isLoading);
  const error = useMidiStore((s) => s.error);

  const refreshPorts = useMidiStore((s) => s.refreshPorts);
  const refreshStatus = useMidiStore((s) => s.refreshStatus);
  const connect = useMidiStore((s) => s.connect);
  const disconnect = useMidiStore((s) => s.disconnect);
  const startLearn = useMidiStore((s) => s.startLearn);
  const cancelLearn = useMidiStore((s) => s.cancelLearn);
  const fetchMappings = useMidiStore((s) => s.fetchMappings);
  const removeMapping = useMidiStore((s) => s.removeMapping);
  const clearMappings = useMidiStore((s) => s.clearMappings);
  const fetchPresets = useMidiStore((s) => s.fetchPresets);
  const loadPreset = useMidiStore((s) => s.loadPreset);
  const savePreset = useMidiStore((s) => s.savePreset);
  const fetchKeyboardBindings = useMidiStore((s) => s.fetchKeyboardBindings);
  const resetKeyboardBindings = useMidiStore((s) => s.resetKeyboardBindings);
  const clearLogs = useMidiStore((s) => s.clearLogs);

  const [activeTab, setActiveTab] = useState<"learn" | "mappings" | "keyboard" | "monitor">("learn");
  const [selectedInPort, setSelectedInPort] = useState<number | "none">("none");
  const [selectedOutPort, setSelectedOutPort] = useState<number | "none">("none");
  const [newPresetName, setNewPresetName] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedLearnAction, setSelectedLearnAction] = useState<DjAction>(
    ACTION_CATEGORIES[0].actions[0].action,
  );

  useEffect(() => {
    void refreshPorts();
    void refreshStatus();
    void fetchMappings();
    void fetchPresets();
    void fetchKeyboardBindings();
  }, [refreshPorts, refreshStatus, fetchMappings, fetchPresets, fetchKeyboardBindings]);

  // Polling status saat tab MIDI aktif
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 150);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const handleConnect = async () => {
    const inIdx = selectedInPort === "none" ? undefined : Number(selectedInPort);
    const outIdx = selectedOutPort === "none" ? undefined : Number(selectedOutPort);
    await connect(inIdx, outIdx);
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    await savePreset(newPresetName.trim());
    setNewPresetName("");
  };

  const filteredMappings = mappings.filter((m) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q)) ||
      JSON.stringify(m.action).toLowerCase().includes(q)
    );
  });

  return (
    <Panel
      title="MIDI Controller & Hardware Mapping Workstation"
      subtitle="Integrasi Controller MIDI, MIDI Learn Interaktif & Keyboard Shortcuts"
    >
      {/* Top Device Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/60 bg-deck-900/60 p-4">
        {/* Device Port Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted">MIDI In:</span>
            <select
              value={selectedInPort}
              onChange={(e) => setSelectedInPort(e.target.value === "none" ? "none" : Number(e.target.value))}
              className="rounded border border-line bg-deck-950 px-2.5 py-1 text-xs text-ink focus:border-emerald-500 focus:outline-none"
            >
              <option value="none">-- Pilih Port Input --</option>
              {inputs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted">MIDI Out (LED):</span>
            <select
              value={selectedOutPort}
              onChange={(e) => setSelectedOutPort(e.target.value === "none" ? "none" : Number(e.target.value))}
              className="rounded border border-line bg-deck-950 px-2.5 py-1 text-xs text-ink focus:border-emerald-500 focus:outline-none"
            >
              <option value="none">-- Pilih Port Output --</option>
              {outputs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void refreshPorts()}
            className="flex items-center gap-1.5 rounded border border-line bg-deck-800 px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-ink"
            title="Pindai ulang port MIDI yang tersedia"
          >
            <IconRefresh className="w-3.5 h-3.5" /> Pindai Ulang
          </button>

          {status.connectedInput || status.connectedOutput ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={isLoading}
              className="rounded border border-red-500/50 bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 hover:bg-red-500/30"
            >
              Putuskan Sambungan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={isLoading || (selectedInPort === "none" && selectedOutPort === "none")}
              className="rounded border border-emerald-500/50 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Sambungkan Perangkat
            </button>
          )}
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status.connectedInput ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-zinc-600"
              }`}
            />
            <span className="text-[11px] font-mono text-ink-dim">
              IN: {status.connectedInput ?? "Tidak Ada"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status.connectedOutput ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-zinc-600"
              }`}
            />
            <span className="text-[11px] font-mono text-ink-dim">
              OUT: {status.connectedOutput ?? "Tidak Ada"}
            </span>
          </div>

          <span className="rounded bg-deck-800 px-2 py-0.5 text-[11px] font-mono text-ink-muted">
            {mappings.length} Pemetaan Aktif
          </span>
        </div>
      </div>

      {/* Preset Management Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/40 bg-deck-950/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-muted">Preset Controller:</span>
          <select
            value={status.activePreset}
            onChange={(e) => void loadPreset(e.target.value)}
            className="rounded border border-line bg-deck-900 px-2.5 py-1 text-xs font-medium text-emerald-400 focus:outline-none"
          >
            {presets.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Nama preset baru..."
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            className="w-44 rounded border border-line bg-deck-900 px-2 py-0.5 text-xs text-ink placeholder:text-ink-faint focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSavePreset()}
            disabled={!newPresetName.trim()}
            className="rounded border border-line bg-deck-800 px-2.5 py-1 text-xs font-medium text-ink-dim hover:text-ink disabled:opacity-40"
          >
            Simpan Preset
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div className="flex border-b border-line/60 bg-deck-900/30 px-4">
        <button
          type="button"
          onClick={() => setActiveTab("learn")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "learn"
              ? "border-emerald-400 text-emerald-300 bg-emerald-500/10"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Interactive MIDI Learn
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mappings")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "mappings"
              ? "border-cyan-400 text-cyan-300 bg-cyan-500/10"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          Tabel Pemetaan ({mappings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("keyboard")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "keyboard"
              ? "border-purple-400 text-purple-300 bg-purple-500/10"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          Keyboard Shortcuts ({keyboardBindings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("monitor")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "monitor"
              ? "border-amber-400 text-amber-300 bg-amber-500/10"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Live Activity Monitor ({activityLogs.length})
        </button>
      </div>

      {/* Tab 1: Interactive MIDI Learn */}
      {activeTab === "learn" && (
        <div className="p-4">
          {/* Learn Status Banner */}
          {status.isLearning ? (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/60 bg-amber-500/15 p-4 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <div>
                  <div className="text-sm font-bold text-amber-200">
                    Mode MIDI Learn Aktif!
                  </div>
                  <div className="text-xs text-amber-300/80">
                    Tekan tombol, geser fader, atau putar knob pada DJ controller Anda untuk memetakan fungsi ini...
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void cancelLearn()}
                className="rounded border border-amber-400/50 bg-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/40"
              >
                Batalkan Learn
              </button>
            </div>
          ) : (
            <div className="mb-4 rounded border border-line/60 bg-deck-900/40 p-3 text-xs text-ink-muted">
              Pilih aksi DJ di bawah ini, lalu klik tombol <strong className="text-emerald-400">"Mulai Learn"</strong> untuk mengaitkan kontrol fisik DJ controller (fader, knob, pad, atau jog wheel) secara instan.
            </div>
          )}

          {/* Action Categories Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ACTION_CATEGORIES.map((cat) => (
              <div key={cat.category} className="rounded-lg border border-line/60 bg-deck-950/60 p-3">
                <h4 className="mb-2 text-xs font-bold text-ink-dim uppercase tracking-wider">
                  {cat.category}
                </h4>
                <div className="space-y-1.5">
                  {cat.actions.map((item, idx) => {
                    const isTarget =
                      JSON.stringify(item.action) === JSON.stringify(selectedLearnAction);
                    const isLearningThis =
                      status.isLearning &&
                      JSON.stringify(item.action) === JSON.stringify(learnStatus.targetAction);

                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition ${
                          isLearningThis
                            ? "border border-amber-400 bg-amber-500/20 text-amber-200"
                            : isTarget
                            ? "bg-deck-800/80 text-ink"
                            : "bg-deck-900/40 text-ink-muted hover:bg-deck-900"
                        }`}
                      >
                        <span className="truncate pr-2 font-medium">{item.label}</span>
                        {isLearningThis ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Listening...
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLearnAction(item.action);
                              void startLearn(item.action);
                            }}
                            className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30"
                          >
                            Learn
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Mappings Table */}
      {activeTab === "mappings" && (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="Cari pemetaan..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-64 rounded border border-line bg-deck-950 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-cyan-500 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => {
                if (window.confirm("Kosongkan seluruh pemetaan MIDI aktif?")) {
                  void clearMappings();
                }
              }}
              className="rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"
            >
              Hapus Semua Pemetaan
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line/60">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line/60 bg-deck-900 text-ink-muted font-bold">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Tipe Pesan</th>
                  <th className="px-3 py-2">Control #</th>
                  <th className="px-3 py-2">Aksi Terpetakan</th>
                  <th className="px-3 py-2">Keterangan</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40 font-mono">
                {filteredMappings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-ink-faint">
                      Belum ada pemetaan yang cocok
                    </td>
                  </tr>
                ) : (
                  filteredMappings.map((m) => (
                    <tr key={m.id} className="hover:bg-deck-900/50 text-ink">
                      <td className="px-3 py-2 text-ink-faint">{m.id}</td>
                      <td className="px-3 py-2 font-bold text-cyan-400">Ch {m.channel + 1}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${
                            m.messageType === "noteOn"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : m.messageType === "controlChange"
                              ? "bg-purple-500/20 text-purple-300"
                              : "bg-blue-500/20 text-blue-300"
                          }`}
                        >
                          {m.messageType}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold text-amber-300">
                        {m.control}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-ink-dim">
                        {m.action.type}{" "}
                        {"payload" in m.action ? JSON.stringify(m.action.payload) : ""}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {m.description ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void removeMapping(m.id)}
                          className="text-red-400 hover:text-red-300 font-sans text-xs"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Keyboard Shortcuts */}
      {activeTab === "keyboard" && (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs text-ink-muted">
              Pintasan keyboard komputer standar workstation DJDeX. Tekan tombol pada keyboard saat aplikasi aktif untuk mengeksekusi kontrol secara real-time.
            </div>
            <button
              type="button"
              onClick={() => void resetKeyboardBindings()}
              className="rounded border border-line bg-deck-900 px-3 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
            >
              Reset ke Standar Pabrik
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {keyboardBindings.map((kb, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-line/60 bg-deck-950/60 p-3"
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-1 font-mono">
                    {kb.ctrl && (
                      <kbd className="rounded border border-line bg-deck-800 px-1.5 py-0.5 text-[10px] text-ink-dim">
                        Ctrl
                      </kbd>
                    )}
                    {kb.shift && (
                      <kbd className="rounded border border-line bg-deck-800 px-1.5 py-0.5 text-[10px] text-ink-dim">
                        Shift
                      </kbd>
                    )}
                    {kb.alt && (
                      <kbd className="rounded border border-line bg-deck-800 px-1.5 py-0.5 text-[10px] text-ink-dim">
                        Alt
                      </kbd>
                    )}
                    <kbd className="rounded border border-purple-500/50 bg-purple-500/20 px-2 py-0.5 text-xs font-bold text-purple-300">
                      {kb.key}
                    </kbd>
                  </div>
                  <div className="text-xs text-ink-dim font-medium">
                    {kb.description ?? kb.action.type}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-ink-faint uppercase">
                  {kb.action.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Live Activity Monitor */}
      {activeTab === "monitor" && (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs text-ink-muted">
              Log aktivitas biner MIDI masuk secara real-time dari controller DJ Anda.
            </div>
            <button
              type="button"
              onClick={clearLogs}
              className="rounded border border-line bg-deck-900 px-3 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
            >
              Bersihkan Log
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-line/60 bg-deck-950/80 p-2 font-mono text-xs">
            {activityLogs.length === 0 ? (
              <div className="py-8 text-center text-ink-faint">
                Belum ada aktivitas MIDI yang terdeteksi. Sambungkan perangkat dan gerakkan kontrol fisik.
              </div>
            ) : (
              <div className="space-y-1">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded px-2.5 py-1 hover:bg-deck-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-ink-faint">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-bold text-cyan-400">Ch {log.channel + 1}</span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] uppercase font-bold ${
                          log.messageType === "noteOn"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : log.messageType === "controlChange"
                            ? "bg-purple-500/20 text-purple-300"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {log.messageType}
                      </span>
                      <span className="text-ink-muted">
                        Ctrl: <strong className="text-ink">{log.control}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Mini visual bar for 0..127 */}
                      <div className="h-2 w-24 rounded bg-deck-900 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${(log.value / 127) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-bold text-amber-300">
                        {log.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
