import { formatDb, formatHz, formatInt, formatMs } from "../lib/format";
import {
  TONE_DEFAULT_DB,
  TONE_DEFAULT_HZ,
  TONE_MAX_DB,
  TONE_MAX_HZ,
  TONE_MIN_DB,
  TONE_MIN_HZ,
  useAudioStore,
} from "../stores/audioStore";
import { LevelMeter } from "./ui/LevelMeter";
import { Panel } from "./ui/Panel";
import { Slider } from "./ui/Slider";

const FREQUENCY_PRESETS = [55, 100, 440, 1000, 8000];

export function ToneTestPanel() {
  const { status, toneFreqHz, toneGainDb, setToneFreq, setToneGain, setToneEnabled } =
    useAudioStore();

  const ready = Boolean(status?.initialized && status.running);
  const enabled = Boolean(status?.toneEnabled);

  const periodMs = status?.latencyMs ?? null;
  const dspLoad =
    periodMs && status && status.callbackUsMax > 0
      ? (status.callbackUsMax / 1000 / periodMs) * 100
      : null;

  const stats: Array<[string, string]> = [
    ["Callback", formatInt(status?.callbacks)],
    ["Frame diproses", formatInt(status?.frames)],
    [
      "Waktu callback",
      status?.callbackUsLast
        ? `${formatInt(status.callbackUsLast)} / ${formatInt(status.callbackUsMax)} µs`
        : "—",
    ],
    ["Beban periode", dspLoad == null ? "—" : `${dspLoad.toFixed(1)} %`],
    ["Periode buffer", formatMs(periodMs)],
    ["Xrun / error", status?.xruns != null ? formatInt(status.xruns) : "—"],
  ];

  return (
    <Panel
      title="Test Tone"
      subtitle="Generator sine lock-free untuk memverifikasi output, level, dan latensi."
      actions={
        <span className="chip">
          <span className={`led ${enabled ? "led-on" : ""}`} />
          {enabled ? "TONE ON" : "TONE OFF"}
        </span>
      }
    >
      <button
        type="button"
        onClick={() => void setToneEnabled(!enabled)}
        disabled={!ready}
        className={`btn h-12 w-full text-sm ${enabled ? "btn-danger" : "btn-primary"}`}
        aria-pressed={enabled}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
          <path
            d="M6 2.5v11M3 5v6M9 4v8M12 6v4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {enabled ? "Hentikan test tone" : "Mulai test tone"}
      </button>

      {!ready ? (
        <p className="mt-2 text-[11px] text-ink-faint">
          Nyalakan audio engine di panel Audio Output terlebih dahulu.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Slider
            id="tone-frequency"
            label="Frekuensi"
            value={toneFreqHz}
            min={TONE_MIN_HZ}
            max={TONE_MAX_HZ}
            scale="log"
            onChange={setToneFreq}
            display={formatHz(toneFreqHz)}
            hint="Double-click untuk kembali ke 440 Hz."
            onReset={() => setToneFreq(TONE_DEFAULT_HZ)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FREQUENCY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`chip transition-colors hover:border-cyan/50 hover:text-cyan-soft ${
                  Math.abs(toneFreqHz - preset) < 0.5 ? "border-cyan/60 text-cyan-soft" : ""
                }`}
                onClick={() => setToneFreq(preset)}
              >
                {preset >= 1000 ? `${preset / 1000}k` : preset} Hz
              </button>
            ))}
          </div>
        </div>

        <Slider
          id="tone-gain"
          label="Level"
          value={toneGainDb}
          min={TONE_MIN_DB}
          max={TONE_MAX_DB}
          step={0.5}
          onChange={setToneGain}
          display={formatDb(toneGainDb)}
          hint="Double-click untuk kembali ke -12 dBFS."
          onReset={() => setToneGain(TONE_DEFAULT_DB)}
        />

        <LevelMeter peak={status?.peak ?? 0} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="field-label truncate">{label}</dt>
            <dd className="readout mt-0.5 truncate text-[13px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 rounded-lg border border-line bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-ink-faint">
        Turunkan volume monitor/headphone sebelum menekan tombol. Test tone tidak melalui
        limiter master penuh (limiter & mixer hadir di Fase 4); soft-clip kubik hanya
        bertindak sebagai pengaman.
      </p>
    </Panel>
  );
}
