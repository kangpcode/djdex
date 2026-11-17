import { formatInt, formatMs, formatSampleRate } from "../lib/format";
import { isTauri } from "../lib/ipc";
import { BUFFER_OPTIONS, useAudioStore } from "../stores/audioStore";
import { Panel } from "./ui/Panel";
import { IconClose } from "./ui/Icons";
import { Select } from "./ui/Select";

export function AudioEnginePanel() {
  const {
    devices,
    devicesLoading,
    selectedDeviceId,
    bufferSize,
    sampleRate,
    channels,
    status,
    busy,
    error,
    refreshDevices,
    selectDevice,
    setBufferSize,
    setSampleRate,
    setChannels,
    startEngine,
    stopEngine,
    clearError,
  } = useAudioStore();

  const activeDevice =
    devices.find((device) => device.id === selectedDeviceId) ??
    devices.find((device) => device.isDefault) ??
    null;

  const deviceOptions = [
    { value: "", label: "Sistem default (mengikuti OS)" },
    ...devices.map((device) => ({
      value: device.id,
      label: `${device.name}${device.isDefault ? " · default" : ""} — ${device.host}`,
    })),
  ];

  const bufferOptions = [
    { value: "auto", label: "Auto (buffer perangkat)" },
    ...BUFFER_OPTIONS.map((frames) => ({
      value: String(frames),
      label: `${frames} frame`,
    })),
  ];

  const rateOptions = [
    { value: "auto", label: "Auto (default perangkat)" },
    ...(activeDevice?.sampleRates ?? []).map((rate) => ({
      value: String(rate),
      label: formatSampleRate(rate),
    })),
  ];

  const supportedChannels = activeDevice?.supportedChannels?.length
    ? activeDevice.supportedChannels
    : [2];
  const channelOptions = [
    { value: "auto", label: "Auto — stereo (paling kompatibel)" },
    ...supportedChannels.map((value) => ({
      value: String(value),
      label:
        value === 2
          ? "2 ch — Stereo (master L/R)"
          : value === 4
            ? "4 ch — Master 1/2 + Headphone Cue 3/4"
            : `${value} ch`,
    })),
  ];

  const deviceHint = activeDevice
    ? `${activeDevice.maxChannels} channel · ${activeDevice.sampleFormats.join("/") || "format ?"}${
        activeDevice.bufferFramesMin != null && activeDevice.bufferFramesMax != null
          ? ` · buffer ${activeDevice.bufferFramesMin}–${activeDevice.bufferFramesMax} frame`
          : ""
      }`
    : "Pilih perangkat untuk melihat kapabilitasnya.";

  const metrics: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: "Host API", value: status?.host ?? activeDevice?.host ?? "—" },
    {
      label: "Sample rate",
      value: status?.sampleRate ? formatSampleRate(status.sampleRate) : "—",
    },
    {
      label: "Format / channel",
      value:
        status?.sampleFormat != null
          ? `${status.sampleFormat.toUpperCase()} · ${status.channels} ch`
          : "—",
    },
    {
      label: "Buffer",
      value:
        status?.bufferFrames != null
          ? `${formatInt(status.bufferFrames)} frame`
          : "Default perangkat",
    },
    { label: "Latensi periode", value: formatMs(status?.latencyMs) },
    {
      label: "Waktu callback (max)",
      value:
        status?.initialized && status.callbackUsMax > 0
          ? `${formatInt(status.callbackUsMax)} µs`
          : "—",
    },
  ];

  return (
    <Panel
      title="Audio Output"
      subtitle="Deteksi perangkat CPAL, pemilihan buffer, dan pembukaan stream real-time."
      actions={
        <>
          <button
            type="button"
            className="btn px-3 py-1.5 text-xs"
            onClick={() => void refreshDevices()}
            disabled={devicesLoading || busy}
          >
            {devicesLoading ? "Memindai…" : "Pindai ulang"}
          </button>
          <span className="chip">
            <span className={`led ${status?.running ? "led-on" : ""}`} />
            {status?.running ? "STREAM ON" : "STREAM OFF"}
          </span>
        </>
      }
    >
      {!isTauri() ? (
        <div className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
          UI sedang dibuka di browser biasa. Audio engine Rust hanya aktif saat dijalankan
          lewat <span className="font-mono">npm run tauri dev</span>.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select
            id="audio-device"
            label="Perangkat output"
            value={selectedDeviceId}
            options={deviceOptions}
            onChange={selectDevice}
            disabled={busy || devicesLoading}
            hint={deviceHint}
          />
        </div>

        <Select
          id="buffer-size"
          label="Buffer size"
          value={bufferSize == null ? "auto" : String(bufferSize)}
          options={bufferOptions}
          onChange={(value) => setBufferSize(value === "auto" ? null : Number(value))}
          disabled={busy}
          hint="Kecil = latensi rendah. 256 frame ≈ 5.3 ms @48 kHz."
        />

        <Select
          id="sample-rate"
          label="Sample rate"
          value={sampleRate == null ? "auto" : String(sampleRate)}
          options={rateOptions}
          onChange={(value) => setSampleRate(value === "auto" ? null : Number(value))}
          disabled={busy}
          hint="Auto mengikuti konfigurasi default perangkat."
        />

        <div className="sm:col-span-2">
          <Select
            id="channels"
            label="Channel output"
            value={channels == null ? "auto" : String(channels)}
            options={channelOptions}
            onChange={(value) => setChannels(value === "auto" ? null : Number(value))}
            disabled={busy}
            hint="Engine mencoba konfigurasi berurutan: pilihan Anda → stereo → default perangkat. Stereo selalu aman di ALSA; 4 channel hanya untuk antarmuka audio yang benar-benar mendukung master + cue terpisah."
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => void startEngine()}
          disabled={busy || devicesLoading}
        >
          {busy
            ? "Menyiapkan stream…"
            : status?.initialized
              ? "Terapkan ulang konfigurasi"
              : "Nyalakan audio engine"}
        </button>

        {status?.initialized ? (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void stopEngine()}
            disabled={busy}
          >
            Matikan
          </button>
        ) : null}
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
            aria-label="Tutup pesan error"
          >
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-line bg-black/20 p-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="field-label truncate">{metric.label}</dt>
            <dd className="readout mt-0.5 truncate text-[13px] text-ink">{metric.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Fase 11: engine membuka stream secara otomatis saat aplikasi dijalankan, lalu
        menampilkan perangkat, format, buffer, latensi, dan statistik callback yang aktif.
        Jika ALSA menolak channel map (mis. <span className="font-mono">find_matching_chmap</span>),
        engine otomatis turun ke stereo, bukan gagal total.
      </p>
    </Panel>
  );
}
