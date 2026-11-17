import { formatInt, formatMs, formatSampleRate } from "../lib/format";
import type { EngineStatus } from "../lib/ipc";
import { useSkinStore } from "../stores/skinStore";

function Logo() {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Logo DJDeX"
      className="h-11 w-11 shrink-0"
    >
      <defs>
        <linearGradient id="djdex-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="none" stroke="url(#djdex-logo)" strokeWidth="2.5" />
      <circle
        cx="24"
        cy="24"
        r="15"
        fill="none"
        stroke="url(#djdex-logo)"
        strokeWidth="1"
        opacity="0.45"
      />
      <circle cx="24" cy="24" r="2.6" fill="url(#djdex-logo)" />
      <path
        d="M9 27h4l2.4-6.5 3.8 12 3-8.5 2.6 5.5 2.2-3.5H31"
        fill="none"
        stroke="url(#djdex-logo)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusPill({ status }: { status: EngineStatus | null }) {
  if (!status?.initialized) {
    return (
      <span className="chip">
        <span className="led" />
        Engine idle
      </span>
    );
  }

  const running = status.running;

  return (
    <span className="chip" title={status.deviceName ?? undefined}>
      <span className={`led ${running ? "led-on" : "led-error"}`} />
      {running ? "Output aktif" : "Output berhenti"}
      {status.sampleRate ? (
        <>
          <span className="text-ink-faint">·</span>
          {formatSampleRate(status.sampleRate)}
        </>
      ) : null}
      {status.channels ? (
        <>
          <span className="text-ink-faint">·</span>
          {status.channels} ch
        </>
      ) : null}
      {status.sampleFormat ? (
        <>
          <span className="text-ink-faint">·</span>
          {status.sampleFormat.toUpperCase()}
        </>
      ) : null}
      {status.bufferFrames != null ? (
        <>
          <span className="text-ink-faint">·</span>
          {formatInt(status.bufferFrames)} smp
        </>
      ) : null}
      <span className="text-ink-faint">·</span>
      {formatMs(status.latencyMs)}
    </span>
  );
}

export function Header({ status }: { status: EngineStatus | null }) {
  const activeSkin = useSkinStore((s) => s.activeSkin);
  const skins = useSkinStore((s) => s.skins);
  const setSkin = useSkinStore((s) => s.setSkin);

  return (
    <header className="relative z-20 flex items-center gap-4 border-b border-line bg-deck-950/85 px-5 py-3 backdrop-blur">
      <Logo />

      <div className="min-w-0">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-2xl font-semibold tracking-[0.16em] text-ink text-glow-cyan">
            DJDeX
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-magenta/85">
            By Kangpcode
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          Virtual DJ workstation · Mesin Tampilan & Skin Layout Engine
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Quick Skin Switcher */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-line bg-deck-900/80 px-2 py-1 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Skin:</span>
          <select
            value={activeSkin?.metadata.id ?? "classic-club"}
            onChange={(e) => void setSkin(e.target.value)}
            className="bg-transparent text-cyan-300 font-bold text-xs focus:outline-none cursor-pointer"
          >
            {skins.map((s) => (
              <option key={s.metadata.id} value={s.metadata.id} className="bg-deck-950 text-ink">
                {s.metadata.name}
              </option>
            ))}
          </select>
        </div>

        <StatusPill status={status} />
        <span className="chip border-cyan/30 text-cyan-soft">FASE 10</span>
        <span className="chip">v0.10.0</span>
      </div>
    </header>
  );
}
