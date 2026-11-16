import { formatInt, formatMs, formatSampleRate } from "../lib/format";
import type { EngineStatus } from "../lib/ipc";

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
          Virtual DJ workstation · Fase 5: dua deck, hot cue, loop, sync aktif
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <StatusPill status={status} />
        <span className="chip border-cyan/30 text-cyan-soft">FASE 4</span>
        <span className="chip">v0.5.0</span>
      </div>
    </header>
  );
}
