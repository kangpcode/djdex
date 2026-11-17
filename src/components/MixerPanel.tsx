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
import { useSkinStore } from "../stores/skinStore";
import { Fader3D } from "./ui/Fader3D";
import { IconClose } from "./ui/Icons";
import { Knob3D } from "./ui/Knob3D";
import { LevelMeter } from "./ui/LevelMeter";
import { Panel } from "./ui/Panel";

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
      assign: "a",
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
      assign: "b",
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
  { value: "sharp", label: "SHARP CUT" },
];

const ASSIGNS: Array<{ value: CrossfaderAssign; label: string }> = [
  { value: "a", label: "A" },
  { value: "thru", label: "THRU" },
  { value: "b", label: "B" },
];

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function filterLabel(value: number): string {
  if (value < -0.005) {
    return `LPF ${Math.round(-value * 100)}%`;
  }
  if (value > 0.005) {
    return `HPF ${Math.round(value * 100)}%`;
  }
  return "BYPASS";
}

function balanceLabel(value: number): string {
  if (Math.abs(value) < 0.01) {
    return "CENTER";
  }
  return value < 0 ? `L ${Math.round(-value * 100)}%` : `R ${Math.round(value * 100)}%`;
}

interface ChannelStripProps {
  label: string;
  channelIndex: 0 | 1;
  channel: ChannelParams;
  ready: boolean;
  peak: number;
  gainDb: number;
  onGain: (value: number) => void;
  onBand: (band: "lowDb" | "midDb" | "highDb", value: number) => void;
  onKill: (band: "lowKill" | "midKill" | "highKill", value: boolean) => void;
  onFilter: (value: number) => void;
  onFader: (value: number) => void;
  onPfl: (value: boolean) => void;
  onAssign: (value: CrossfaderAssign) => void;
  onResetBand: (band: "lowDb" | "midDb" | "highDb") => void;
  accentColor: string;
}

function ChannelStrip({
  label,
  channelIndex,
  channel,
  ready,
  peak,
  gainDb,
  onGain,
  onBand,
  onKill,
  onFilter,
  onFader,
  onPfl,
  onAssign,
  accentColor,
}: ChannelStripProps) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-[#0a0f18] border border-[#1e2a3c] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.6)]">
      {/* Header Channel */}
      <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-[#1b2536]">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shadow-sm"
            style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
          />
          <h3 className="font-display text-xs font-black uppercase tracking-wider text-slate-200">
            {label}
          </h3>
        </div>
        <span
          className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border"
          style={{
            borderColor: `${accentColor}55`,
            color: accentColor,
            backgroundColor: `${accentColor}11`,
          }}
        >
          CH {channelIndex + 1}
        </span>
      </div>

      {/* TRIM / GAIN Section */}
      <div className="w-full flex flex-col items-center py-1">
        <Knob3D
          label="TRIM"
          size="sm"
          value={gainDb}
          min={-60}
          max={12}
          step={0.5}
          defaultValue={0}
          onChange={onGain}
          display={formatDb(gainDb)}
          accentColor={accentColor}
          disabled={!ready}
          hint="Gain / Trim pre-EQ. Double-click untuk 0 dB."
        />
      </div>

      {/* 3-Band EQ Strip (Pioneer DJM Isolate/EQ Style) */}
      <div className="w-full flex flex-col items-center gap-2 my-2 py-2 px-1 rounded-lg bg-[#070b13] border border-[#162130]">
        <div className="flex flex-col items-center w-full">
          <Knob3D
            label="HI"
            size="md"
            value={channel.highDb}
            min={-26}
            max={12}
            step={0.5}
            defaultValue={0}
            onChange={(val) => onBand("highDb", val)}
            display={formatDb(channel.highDb)}
            bipolar
            accentColor={accentColor}
            disabled={!ready}
          />
          <button
            type="button"
            className={`mt-1 px-2 py-0.5 rounded text-[8.5px] font-mono font-bold tracking-wider transition ${
              channel.highKill
                ? "bg-red-500/30 border border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                : "bg-[#0f1724] border border-[#233144] text-slate-500 hover:text-slate-300"
            }`}
            onClick={() => onKill("highKill", !channel.highKill)}
            disabled={!ready}
            title="HI EQ Kill (-inf dB)"
          >
            KILL
          </button>
        </div>

        <div className="flex flex-col items-center w-full">
          <Knob3D
            label="MID"
            size="md"
            value={channel.midDb}
            min={-26}
            max={12}
            step={0.5}
            defaultValue={0}
            onChange={(val) => onBand("midDb", val)}
            display={formatDb(channel.midDb)}
            bipolar
            accentColor={accentColor}
            disabled={!ready}
          />
          <button
            type="button"
            className={`mt-1 px-2 py-0.5 rounded text-[8.5px] font-mono font-bold tracking-wider transition ${
              channel.midKill
                ? "bg-red-500/30 border border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                : "bg-[#0f1724] border border-[#233144] text-slate-500 hover:text-slate-300"
            }`}
            onClick={() => onKill("midKill", !channel.midKill)}
            disabled={!ready}
            title="MID EQ Kill (-inf dB)"
          >
            KILL
          </button>
        </div>

        <div className="flex flex-col items-center w-full">
          <Knob3D
            label="LOW"
            size="md"
            value={channel.lowDb}
            min={-26}
            max={12}
            step={0.5}
            defaultValue={0}
            onChange={(val) => onBand("lowDb", val)}
            display={formatDb(channel.lowDb)}
            bipolar
            accentColor={accentColor}
            disabled={!ready}
          />
          <button
            type="button"
            className={`mt-1 px-2 py-0.5 rounded text-[8.5px] font-mono font-bold tracking-wider transition ${
              channel.lowKill
                ? "bg-red-500/30 border border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                : "bg-[#0f1724] border border-[#233144] text-slate-500 hover:text-slate-300"
            }`}
            onClick={() => onKill("lowKill", !channel.lowKill)}
            disabled={!ready}
            title="LOW EQ Kill (-inf dB)"
          >
            KILL
          </button>
        </div>
      </div>

      {/* SOUND COLOR FX / FILTER */}
      <div className="w-full flex flex-col items-center py-1.5 my-1 rounded-lg bg-[#070b13] border border-[#162130]">
        <Knob3D
          label="COLOR FX"
          size="lg"
          value={channel.filter}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={onFilter}
          display={filterLabel(channel.filter)}
          bipolar
          accentColor={channel.filter < -0.01 ? "#00e5ff" : channel.filter > 0.01 ? "#f97316" : "#cbd5e1"}
          disabled={!ready}
          hint="Sound Color Filter: Putar kiri untuk LPF, putar kanan untuk HPF."
        />
        <div className="flex justify-between w-full px-4 mt-1 text-[8.5px] font-mono text-slate-400 font-bold">
          <span className={channel.filter < -0.05 ? "text-cyan-400 font-black" : ""}>LPF</span>
          <span className={Math.abs(channel.filter) <= 0.05 ? "text-slate-200 font-black" : ""}>BYPASS</span>
          <span className={channel.filter > 0.05 ? "text-orange-400 font-black" : ""}>HPF</span>
        </div>
      </div>

      {/* Headphone CUE / PFL Button (Pioneer Tactile LED Button) */}
      <div className="w-full my-2.5">
        <button
          type="button"
          onClick={() => onPfl(!channel.pfl)}
          disabled={!ready}
          className={`w-full py-2 px-3 rounded-lg font-display font-black text-xs tracking-widest transition-all duration-100 ${
            channel.pfl
              ? "bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.5),inset_0_0_8px_rgba(245,158,11,0.25)]"
              : "bg-[#0c121e] border border-[#26354a] text-slate-400 hover:border-slate-500 hover:text-slate-200"
          }`}
          title="Headphone CUE (Pre-Fader Listen)"
        >
          <div className="flex items-center justify-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                channel.pfl ? "bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse" : "bg-slate-600"
              }`}
            />
            CUE
          </div>
        </button>
      </div>

      {/* Channel Fader & Vertical Level Meter Side-by-Side */}
      <div className="w-full flex items-center justify-center gap-3 my-2 py-2 px-2 rounded-lg bg-[#05080e] border border-[#141d2a]">
        <LevelMeter peak={peak} orientation="vertical" heightPx={140} channelLabels={["L", "R"]} />
        <Fader3D
          label=""
          value={channel.fader}
          min={0}
          max={1}
          step={0.001}
          defaultValue={1}
          onChange={onFader}
          display={percent(channel.fader)}
          orientation="vertical"
          lengthPx={140}
          accentColor={accentColor}
          disabled={!ready}
          hint={`CH ${channelIndex + 1} Volume Fader: ${percent(channel.fader)}`}
        />
      </div>

      {/* Crossfader Assign 3-way hardware selector */}
      <div className="w-full mt-2">
        <span className="block text-center font-mono text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">
          X-Fader Assign
        </span>
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-md bg-[#05080e] border border-[#182333]">
          {ASSIGNS.map((assign) => {
            const active = channel.assign === assign.value;
            return (
              <button
                key={assign.value}
                type="button"
                className={`py-1 text-[10px] font-mono font-bold rounded transition-all ${
                  active
                    ? "bg-[#1e2e46] text-cyan-300 border border-cyan-500/50 shadow-[0_0_8px_rgba(0,229,255,0.3)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                onClick={() => onAssign(assign.value)}
                disabled={!ready}
              >
                {assign.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
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
  const deckAGainDb = useDeckAStore((state) => state.status?.gainDb ?? 0);
  const deckBGainDb = useDeckBStore((state) => state.status?.gainDb ?? 0);
  const setDeckAGain = useDeckAStore((state) => state.setGainDb);
  const setDeckBGain = useDeckBStore((state) => state.setGainDb);

  const skin = useSkinStore((state) => state.activeSkin);
  const accentA = skin?.theme.accentDeckA ?? "#00e5ff";
  const accentB = skin?.theme.accentDeckB ?? "#ff007f";

  const m = mixer ?? FALLBACK;
  const ready = Boolean(engine?.initialized);
  const channels = engine?.channels ?? 0;

  const cueMode =
    channels >= 4
      ? "Headphone output 3/4 (terpisah dari master 1/2)."
      : channels === 2 && m.splitCue
        ? "Split cue: L = cue, R = master."
        : channels === 2
          ? "Output stereo 2-ch (aktifkan Split Cue untuk monitoring headphone)."
          : "Mono output.";

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
      title="Hardware DJ Mixer"
      subtitle="Pioneer DJM Style · 3-Band Isolator · Sound Color Filter · Magvel Crossfader"
      accentColor={skin?.theme.primaryColor}
      actions={
        <span className="chip">
          <span className={`led ${ready ? "led-on" : ""}`} />
          {ready ? "MIXER ONLINE" : "ENGINE STANDBY"}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Master & Booth Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#090e17] border border-[#1c293c] shadow-sm">
          {/* Master Section */}
          <div className="flex items-center gap-3">
            <Knob3D
              label="MASTER VOL"
              size="sm"
              value={m.masterVolume}
              min={0}
              max={1}
              step={0.01}
              defaultValue={1}
              onChange={(val) => set({ masterVolume: val })}
              display={percent(m.masterVolume)}
              accentColor="#22d3ee"
              disabled={!ready}
            />

            <Knob3D
              label="BALANCE"
              size="sm"
              value={m.masterBalance}
              min={-1}
              max={1}
              step={0.01}
              defaultValue={0}
              onChange={(val) => set({ masterBalance: val })}
              display={balanceLabel(m.masterBalance)}
              bipolar
              accentColor="#94a3b8"
              disabled={!ready}
            />

            <div className="flex flex-col gap-1">
              <button
                type="button"
                className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider rounded border transition ${
                  m.limiterEnabled
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.3)]"
                    : "bg-[#0d1420] border-[#223144] text-slate-500"
                }`}
                onClick={() => set({ limiterEnabled: !m.limiterEnabled })}
                disabled={!ready}
              >
                LIMITER {m.limiterEnabled ? "ON" : "OFF"}
              </button>
              <span className="text-[8.5px] font-mono text-slate-400">
                Reduksi: {(engine?.limiterReductionDb ?? 0).toFixed(1)} dB
              </span>
            </div>
          </div>

          {/* Master Stereo Level Meter */}
          <div className="flex-1 max-w-[190px]">
            <LevelMeter
              peak={Math.max(engine?.masterPeakL ?? 0, engine?.masterPeakR ?? 0)}
              peaks={[engine?.masterPeakL ?? 0, engine?.masterPeakR ?? 0]}
              channelLabels={["M L", "M R"]}
              compact
            />
          </div>

          {/* Headphone Cue Section */}
          <div className="flex items-center gap-3">
            <Knob3D
              label="HEADPHONES"
              size="sm"
              value={m.cueVolume}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.7}
              onChange={(val) => set({ cueVolume: val })}
              display={percent(m.cueVolume)}
              accentColor="#fbbf24"
              disabled={!ready}
            />

            <Knob3D
              label="CUE MIX"
              size="sm"
              value={m.cueMix}
              min={0}
              max={1}
              step={0.01}
              defaultValue={1}
              onChange={(val) => set({ cueMix: val })}
              display={m.cueMix >= 0.99 ? "CUE" : m.cueMix <= 0.01 ? "MST" : percent(m.cueMix)}
              accentColor="#fbbf24"
              disabled={!ready}
              hint="0 = Master, 1 = Cue (PFL)"
            />

            <button
              type="button"
              className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider rounded border transition ${
                m.splitCue
                  ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                  : "bg-[#0d1420] border-[#223144] text-slate-500"
              }`}
              onClick={() => set({ splitCue: !m.splitCue })}
              disabled={!ready}
              title={cueMode}
            >
              SPLIT CUE
            </button>
          </div>
        </div>

        {/* 2 Vertical Channel Strips (DJM-900 / FLX4 Architecture) */}
        <div className="grid grid-cols-2 gap-3">
          <ChannelStrip
            label="Deck A"
            channelIndex={0}
            channel={m.channels[0]}
            ready={ready}
            peak={deckApeak}
            gainDb={deckAGainDb}
            onGain={(val) => void setDeckAGain(val)}
            onBand={(band, value) => updateChannel(0, { [band]: value } as Partial<ChannelParams>)}
            onKill={(band, value) => updateChannel(0, { [band]: value } as Partial<ChannelParams>)}
            onFilter={(value) => updateChannel(0, { filter: value })}
            onFader={(value) => updateChannel(0, { fader: value })}
            onPfl={(value) => updateChannel(0, { pfl: value })}
            onAssign={(value) => updateChannel(0, { assign: value })}
            onResetBand={(band) => updateChannel(0, { [band]: 0 } as Partial<ChannelParams>)}
            accentColor={accentA}
          />

          <ChannelStrip
            label="Deck B"
            channelIndex={1}
            channel={m.channels[1]}
            ready={ready}
            peak={deckBpeak}
            gainDb={deckBGainDb}
            onGain={(val) => void setDeckBGain(val)}
            onBand={(band, value) => updateChannel(1, { [band]: value } as Partial<ChannelParams>)}
            onKill={(band, value) => updateChannel(1, { [band]: value } as Partial<ChannelParams>)}
            onFilter={(value) => updateChannel(1, { filter: value })}
            onFader={(value) => updateChannel(1, { fader: value })}
            onPfl={(value) => updateChannel(1, { pfl: value })}
            onAssign={(value) => updateChannel(1, { assign: value })}
            onResetBand={(band) => updateChannel(1, { [band]: 0 } as Partial<ChannelParams>)}
            accentColor={accentB}
          />
        </div>

        {/* Crossfader Section (Pioneer Magvel Style) */}
        <div className="flex flex-col items-center p-3 rounded-xl bg-[#080d16] border border-[#1c293c] shadow-lg">
          <div className="w-full flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs font-black tracking-widest text-slate-300 uppercase">
                MAGVEL CROSSFADER
              </span>
              <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[#101726] border border-[#223246] text-slate-400">
                {m.crossfaderReverse ? "HAMSTER / REV" : "NORMAL"}
              </span>
            </div>

            {/* Crossfader Curve Mode */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono text-slate-400 mr-1 font-bold">CURVE:</span>
              {CURVES.map((curve) => (
                <button
                  key={curve.value}
                  type="button"
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded transition ${
                    m.crossfaderCurve === curve.value
                      ? "bg-cyan-500/25 border border-cyan-400 text-cyan-300 shadow-[0_0_6px_rgba(0,229,255,0.3)]"
                      : "bg-[#0e1624] border border-[#1f2c3e] text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => set({ crossfaderCurve: curve.value })}
                  disabled={!ready}
                >
                  {curve.label}
                </button>
              ))}

              <button
                type="button"
                className={`ml-1.5 px-2 py-0.5 text-[9px] font-mono font-bold rounded border transition ${
                  m.crossfaderReverse
                    ? "bg-red-500/30 border-red-400 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                    : "bg-[#0e1624] border-[#1f2c3e] text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => set({ crossfaderReverse: !m.crossfaderReverse })}
                disabled={!ready}
                title="Reverse crossfader direction (Hamster switch)"
              >
                REV
              </button>
            </div>
          </div>

          <div className="w-full flex items-center justify-center py-2">
            <Fader3D
              label=""
              value={m.crossfader}
              min={0}
              max={1}
              step={0.001}
              defaultValue={0.5}
              onChange={(val) => set({ crossfader: val })}
              display={`${Math.round(m.crossfader * 100)}%`}
              orientation="horizontal"
              lengthPx={280}
              accentColor="#00e5ff"
              disabled={!ready}
              hint="Crossfader A <-> B (Double click reset ke tengah 50%)"
            />
          </div>

          <div className="w-full flex justify-between px-6 text-[9.5px] font-mono font-bold">
            <span style={{ color: accentA }}>DECK A</span>
            <span className="text-slate-400">CENTER</span>
            <span style={{ color: accentB }}>DECK B</span>
          </div>
        </div>
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
            className="rounded p-1 text-ink-dim hover:text-ink transition"
            aria-label="Tutup pesan error mixer"
          >
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
