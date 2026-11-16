import { useRef, useState } from "react";

import { formatBpm, formatTime } from "../lib/format";

export type PlatterMode = "vinyl" | "cdj";

interface PlatterProps {
  position: number;
  duration: number;
  playing: boolean;
  bpm: number;
  cue: number;
  mode: PlatterMode;
  onModeChange: (mode: PlatterMode) => void;
  onScratch: (seconds: number) => void;
  onBend: (factor: number) => void;
  onBendEnd: () => void;
  disabled?: boolean;
}

/**
 * Platter virtual: cincin progress + piringan berputar.
 * - Vinyl: drag memutar piringan dan melakukan seek relatif (scratch).
 * - CDJ: drag memberi pitch bend sementara, kembali netral saat dilepas.
 */
export function Platter({
  position,
  duration,
  playing,
  bpm,
  cue,
  mode,
  onModeChange,
  onScratch,
  onBend,
  onBendEnd,
  disabled = false,
}: PlatterProps) {
  const discRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ angle: number; position: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const rotation = (position / 1.8) * 360;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;

  const angleAt = (clientX: number, clientY: number) => {
    const element = discRef.current;
    if (!element) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      angle: angleAt(event.clientX, event.clientY),
      position,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || disabled) {
      return;
    }

    const angle = angleAt(event.clientX, event.clientY);
    let delta = angle - drag.angle;
    if (delta > 180) {
      delta -= 360;
    } else if (delta < -180) {
      delta += 360;
    }
    drag.angle = angle;

    if (mode === "vinyl") {
      // Satu putaran piringan = 1,8 detik audio, seperti gerakan tangan DJ.
      drag.position = Math.max(
        0,
        Math.min(drag.position + (delta / 360) * 1.8, duration || drag.position),
      );
      onScratch(drag.position);
    } else {
      onBend(Math.min(1.6, Math.max(0.4, 1 + delta * 0.012)));
    }
  };

  const endDrag = () => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    if (mode === "cdj") {
      onBendEnd();
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={discRef}
        className={`platter relative h-[142px] w-[142px] select-none ${
          disabled ? "opacity-50" : "cursor-grab active:cursor-grabbing"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        role="slider"
        aria-label={`Platter ${mode === "vinyl" ? "vinyl scratch" : "CDJ pitch bend"}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        tabIndex={0}
      >
        <svg viewBox="0 0 142 142" className="absolute inset-0 h-full w-full">
          <circle
            cx="71"
            cy="71"
            r={radius}
            fill="none"
            stroke="rgba(34,211,238,0.12)"
            strokeWidth="4"
          />
          <circle
            cx="71"
            cy="71"
            r={radius}
            fill="none"
            stroke="rgba(34,211,238,0.95)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${circumference * progress} ${circumference}`}
            transform="rotate(-90 71 71)"
          />
          <circle
            cx="71"
            cy="71"
            r="52"
            fill="url(#vinylGradient)"
            stroke="rgba(148,163,184,0.18)"
          />
          <defs>
            <radialGradient id="vinylGradient" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#233044" />
              <stop offset="55%" stopColor="#0c131d" />
              <stop offset="100%" stopColor="#05080d" />
            </radialGradient>
          </defs>
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "71px 71px",
              transition: dragging ? "none" : "transform 90ms linear",
            }}
          >
            <circle cx="71" cy="71" r="42" fill="none" stroke="rgba(148,163,184,0.13)" />
            <circle cx="71" cy="71" r="34" fill="none" stroke="rgba(148,163,184,0.1)" />
            <line x1="71" y1="71" x2="71" y2="31" stroke="rgba(34,211,238,0.75)" strokeWidth="2" />
            <circle cx="71" cy="31" r="3.2" fill="#22d3ee" />
          </g>
          <circle cx="71" cy="71" r="7" fill="#94a3b8" />
          <circle cx="71" cy="71" r="3" fill="#0b1118" />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="readout text-[13px] text-cyan-soft">{formatTime(position)}</span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            {playing ? "playing" : "paused"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`btn px-2 py-0.5 text-[10px] ${mode === "vinyl" ? "btn-primary" : ""}`}
          onClick={() => onModeChange("vinyl")}
          aria-pressed={mode === "vinyl"}
          title="Drag piringan untuk scratch (seek relatif)"
        >
          VINYL
        </button>
        <button
          type="button"
          className={`btn px-2 py-0.5 text-[10px] ${mode === "cdj" ? "btn-primary" : ""}`}
          onClick={() => onModeChange("cdj")}
          aria-pressed={mode === "cdj"}
          title="Drag piringan untuk pitch bend sementara"
        >
          CDJ
        </button>
      </div>
      <p className="text-[9.5px] text-ink-faint">
        {formatBpm(bpm)} BPM · cue {formatTime(cue)}
      </p>
    </div>
  );
}
