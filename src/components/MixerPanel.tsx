import { formatDb } from "../lib/format";
import type {
  ChannelParams,
  CrossfaderAssign,
  CrossfaderCurve,
  MixerParams,
  MixerUpdate,
} from "../lib/ipc";
import { useAudioStore } from "../stores/audioStore";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { useMixerStore } from "../stores/mixerStore";
import { LevelMeter } from "./ui/LevelMeter";
import { Panel } from "./ui/Panel";
import { Slider } from "./ui/Slider";

const FALLBACK: MixerParams = {
  channels: [
    {
      lowDb: 0,
      midDb: 0,
      highDb: 0,
      lowKill: false,
      midKill: false,
      highKill: false,
      filter: 0,
      fader: 1,
      pfl: false,
      assign: "thru",
    },
    {
      lowDb: 0,
      midDb: 0,
      highDb: 0,
      lowKill: false,
      midKill: false,
      highKill: false,
      filter: 0,
      fader: 1,
      pfl: false,
      assign: "thru",
    },
  ],
  crossfader: 0.5,
  crossfaderCurve: "smooth",
  crossfaderReverse: false,
  masterVolume: 1,
  masterBalance: 0,
  limiterEnabled: true,
  cueVolume: 0.7,
  cueMix: 1,
  splitCue: false,
};

const CURVES: Array<{ value: CrossfaderCurve; label: string }> = [
  { value: "smooth", label: "SMOOTH" },
  { value: "constant-power", label: "CONST PWR" },
  { value: "sharp", label: "SHARP" },
];

const ASSIGNS: Array<{ value: CrossfaderAssign; label: string }> = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "thru", label: "THRU" },
];

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function filterLabel(value: number): string {
  if (value < -0.005) {
    return `LPF ${Math.round(-value * 100)} %`;
  }
  if (value > 0.005) {
    return `HPF ${Math.round(value * 100)} %`;
  }
  return "BYPASS";
}

function balanceLabel(value: number): string {
  if (Math.abs(value) < 0.01) {
    return "CENTER";
  }
  return value < 0 ? `L ${Math.round(-value * 100)} %` : `R ${Math.round(value * 100)} %`;
}

interface ChannelStripProps {
  label: string;
  channel: ChannelParams;
  ready: boolean;
  peak: number;
  onBand: (band: "lowDb" | "midDb" | "highDb", value: number) => void;
  onKill: (band: "lowKill" | "midKill" | "highKill", value: boolean) => void;
  onFilter: (value: number) => void;
  onFader: (value: number) => void;
  onPfl: (value: boolean) => void;
  onAssign: (value: CrossfaderAssign) => void;
  onResetBand: (band: "lowDb" | "midDb" | "highDb") => void;
}

function ChannelStrip({
  label,
  channel,
  ready,
  peak,
  onBand,
  onKill,
  onFilter,
  onFader,
  onPfl,
  onAssign,
  onResetBand,
}: ChannelStripProps) {
  const bands = [
    { key: "lowDb" as const, kill: "lowKill" as const, label: "LOW" },
    { key: "midDb" as const, kill: "midKill" as const, label: "MID" },
    { key: "highDb" as const, kill: "highKill" as const, label: "HIGH" },
  ];

  return (
    <section className="rounded-lg border border-line bg-deck-850/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-ink">
          {label}
        </h3>
        <span className={`chip ${channel.pfl ? "border-cyan/40 text-cyan-soft" : ""}`}>
          {channel.pfl ? "PFL" : "AUX"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {bands.map((band) => (
          <Slider
            key={band.key}
            id={`mixer-${label.toLowerCase()}-${band.label.toLowerCase()}`}
            label={band.label}
            value={channel[band.key]}
            min={-26}
            max={12}
            step={0.5}
            onChange={(value) => onBand(band.key, value)}
            display={formatDb(channel[band.key])}
            disabled={!ready}
            onReset={() => onResetBand(band.key)}
          />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {bands.map((band) => (
          <button
            key={band.kill}
            type="button"
            className={`btn px-2 py-1.5 text-[10px] tracking-[0.1em] ${
              channel[band.kill] ? "btn-danger" : ""
            }`}
            onClick={() => onKill(band.kill, !channel[band.kill])}
            disabled={!ready}
            aria-pressed={channel[band.kill]}
          >
            {band.label} KILL
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Slider
          id={`mixer-${label.toLowerCase()}-filter`}
          label="Filter"
          value={channel.filter}
          min={-1}
          max={1}
          step={0.01}
          onChange={onFilter}
          display={filterLabel(channel.filter)}
          disabled={!ready}
          hint="Kiri = LPF, tengah = bypass, kanan = HPF."
          onReset={() => onFilter(0)}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Slider
          id={`mixer-${label.toLowerCase()}-fader`}
          label="Channel fader"
          value={channel.fader}
          min={0}
          max={1}
          step={0.001}
          onChange={onFader}
          display={percent(channel.fader)}
          disabled={!ready}
          onReset={() => onFader(1)}
        />
        <button
          type="button"
          className={`btn h-9 px-3 text-[11px] tracking-[0.12em] ${channel.pfl ? "btn-primary" : ""}`}
          onClick={() => onPfl(!channel.pfl)}
          disabled={!ready}
          aria-pressed={channel.pfl}
          title="Pre-fader listen: kirim channel ke cue bus headphone"
        >
          PFL
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        {ASSIGNS.map((assign) => (
          <button
            key={assign.value}
            type="button"
            className={`btn py-1 text-[10px] ${channel.assign === assign.value ? "btn-primary" : ""}`}
            onClick={() => onAssign(assign.value)}
            disabled={!ready}
            aria-pressed={channel.assign === assign.value}
            title={`Assign channel ke crossfader ${assign.label}`}
          >
            {assign.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <LevelMeter peak={peak} channelLabels={[`${label} L`, `${label} R`]} />
      </div>
    </section>
  );
}

export function MixerPanel() {
  const mixer = useMixerStore((state) => state.status);
  const update = useMixerStore((state) => state.update);
  const error = useMixerStore((state) => state.error);
  const clearError = useMixerStore((state) => state.clearError);
  const engine = useAudioStore((state) => state.status);
  const deckApeak = useDeckAStore((state) => state.status?.peak ?? 0);
  const deckBpeak = useDeckBStore((state) => state.status?.peak ?? 0);

  const m = mixer ?? FALLBACK;
  const ready = Boolean(engine?.initialized);
  const channels = engine?.channels ?? 0;

  const cueMode =
    channels >= 4
      ? "Headphone output 3/4 (terpisah dari master 1/2)."
      : channels === 2 && m.splitCue
        ? "Split cue aktif: L = cue, R = master."
        : channels === 2
          ? "Output stereo: aktifkan split cue atau pakai device ≥ 4 channel."
          : channels === 1
            ? "Output mono: cue headphone tidak tersedia."
            : "Nyalakan engine untuk melihat routing headphone.";

  const set = (patch: MixerUpdate) => {
    if (ready) {
      update(patch);
    }
  };

  const updateChannel = (index: 0 | 1, patch: Partial<ChannelParams>) => {
    if (index === 0) {
      set({ channelA: patch });
    } else {
      set({ channelB: patch });
    }
  };

  return (
    <Panel
      title="Mixer"
      subtitle="Channel A/B · EQ · filter · crossfader · master · cue"
      actions={
        <span className="chip">
          <span className={`led ${ready ? "led-on" : ""}`} />
          {ready ? "MIXER LIVE" : "ENGINE OFF"}
        </span>
      }
    >
      <div className="grid gap-3 xl:grid-cols-2">
        <ChannelStrip
          label="Deck A"
          channel={m.channels[0]}
          ready={ready}
          peak={deckApeak}
          onBand={(band, value) => updateChannel(0, { [band]: value } as Partial<ChannelParams>)}
          onKill={(band, value) => updateChannel(0, { [band]: value } as Partial<ChannelParams>)}
          onFilter={(value) => updateChannel(0, { filter: value })}
          onFader={(value) => updateChannel(0, { fader: value })}
          onPfl={(value) => updateChannel(0, { pfl: value })}
          onAssign={(value) => updateChannel(0, { assign: value })}
          onResetBand={(band) => updateChannel(0, { [band]: 0 } as Partial<ChannelParams>)}
        />
        <ChannelStrip
          label="Deck B"
          channel={m.channels[1]}
          ready={ready}
          peak={deckBpeak}
          onBand={(band, value) => updateChannel(1, { [band]: value } as Partial<ChannelParams>)}
          onKill={(band, value) => updateChannel(1, { [band]: value } as Partial<ChannelParams>)}
          onFilter={(value) => updateChannel(1, { filter: value })}
          onFader={(value) => updateChannel(1, { fader: value })}
          onPfl={(value) => updateChannel(1, { pfl: value })}
          onAssign={(value) => updateChannel(1, { assign: value })}
          onResetBand={(band) => updateChannel(1, { [band]: 0 } as Partial<ChannelParams>)}
        />
      </div>

      {/* Crossfader */}
      <section className="mt-3 rounded-lg border border-line bg-deck-850/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label">Crossfader</span>
          <span className="readout text-[11px] text-ink-faint">
            {m.crossfaderReverse ? "REVERSE" : "NORMAL"}
          </span>
        </div>

        <div className="mt-2">
          <Slider
            id="mixer-crossfader"
            label="A ↔ B"
            value={m.crossfader}
            min={0}
            max={1}
            step={0.001}
            onChange={(value) => set({ crossfader: value })}
            display={`${Math.round(m.crossfader * 100)} %`}
            disabled={!ready}
            onReset={() => set({ crossfader: 0.5 })}
          />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1">
          {CURVES.map((curve) => (
            <button
              key={curve.value}
              type="button"
              className={`btn py-1.5 text-[10px] ${m.crossfaderCurve === curve.value ? "btn-primary" : ""}`}
              onClick={() => set({ crossfaderCurve: curve.value })}
              disabled={!ready}
              aria-pressed={m.crossfaderCurve === curve.value}
            >
              {curve.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn mt-2 w-full py-1.5 text-[10px] tracking-[0.12em] ${
            m.crossfaderReverse ? "btn-danger" : ""
          }`}
          onClick={() => set({ crossfaderReverse: !m.crossfaderReverse })}
          disabled={!ready}
          aria-pressed={m.crossfaderReverse}
        >
          REVERSE CROSSFADER
        </button>
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Master */}
        <section className="rounded-lg border border-line bg-deck-850/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="field-label">Master</span>
            <span className="chip">
              {m.limiterEnabled ? "LIMIT ON" : "LIMIT OFF"}
            </span>
          </div>

          <div className="mt-2">
            <LevelMeter
              peak={Math.max(engine?.masterPeakL ?? 0, engine?.masterPeakR ?? 0)}
              peaks={[engine?.masterPeakL ?? 0, engine?.masterPeakR ?? 0]}
              channelLabels={["M L", "M R"]}
            />
          </div>

          <div className="mt-2">
            <Slider
              id="mixer-master"
              label="Master volume"
              value={m.masterVolume}
              min={0}
              max={1}
              step={0.001}
              onChange={(value) => set({ masterVolume: value })}
              display={percent(m.masterVolume)}
              disabled={!ready}
              onReset={() => set({ masterVolume: 1 })}
            />
          </div>

          <div className="mt-2">
            <Slider
              id="mixer-balance"
              label="Balance"
              value={m.masterBalance}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) => set({ masterBalance: value })}
              display={balanceLabel(m.masterBalance)}
              disabled={!ready}
              onReset={() => set({ masterBalance: 0 })}
            />
          </div>

          <button
            type="button"
            className={`btn mt-2 w-full py-1.5 text-[10px] tracking-[0.12em] ${
              m.limiterEnabled ? "btn-primary" : ""
            }`}
            onClick={() => set({ limiterEnabled: !m.limiterEnabled })}
            disabled={!ready}
            aria-pressed={m.limiterEnabled}
            title="Limiter master stereo-linked, ceiling -0.18 dBFS"
          >
            LIMITER {m.limiterEnabled ? "ON" : "OFF"}
          </button>

          <p className="mt-1.5 text-[10px] text-ink-faint">
            Reduksi limiter: {(engine?.limiterReductionDb ?? 0).toFixed(1)} dB
          </p>
        </section>

        {/* Cue */}
        <section className="rounded-lg border border-line bg-deck-850/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="field-label">Headphone / Cue</span>
            <span className={`chip ${m.channels.some((c) => c.pfl) ? "border-cyan/40 text-cyan-soft" : ""}`}>
              {m.channels.some((c) => c.pfl) ? "PFL ON" : "PFL OFF"}
            </span>
          </div>

          <div className="mt-2">
            <Slider
              id="mixer-cue-volume"
              label="Cue volume"
              value={m.cueVolume}
              min={0}
              max={1}
              step={0.001}
              onChange={(value) => set({ cueVolume: value })}
              display={percent(m.cueVolume)}
              disabled={!ready}
              onReset={() => set({ cueVolume: 0.7 })}
            />
          </div>

          <div className="mt-2">
            <Slider
              id="mixer-cue-mix"
              label="Cue mix"
              value={m.cueMix}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => set({ cueMix: value })}
              display={
                m.cueMix >= 0.99
                  ? "CUE"
                  : m.cueMix <= 0.01
                    ? "MASTER"
                    : percent(m.cueMix)
              }
              disabled={!ready}
              hint="0 = master, 1 = cue (pre-fader)."
              onReset={() => set({ cueMix: 1 })}
            />
          </div>

          <button
            type="button"
            className={`btn mt-2 w-full py-1.5 text-[10px] tracking-[0.12em] ${
              m.splitCue ? "btn-primary" : ""
            }`}
            onClick={() => set({ splitCue: !m.splitCue })}
            disabled={!ready}
            aria-pressed={m.splitCue}
          >
            SPLIT CUE
          </button>

          <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">{cueMode}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">
            Cue diambil post-EQ/filter, pre-fader. Tekan PFL pada channel deck untuk mendengar cue.
          </p>
        </section>
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
            aria-label="Tutup pesan error mixer"
          >
            ✕
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
