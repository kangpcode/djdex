import { useRef, useState } from "react";
import { formatBpm, formatTime } from "../lib/format";

export type PlatterMode = "vinyl" | "cdj";
export type PlatterSize = "compact" | "standard" | "large-battle";

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
  size?: PlatterSize;
  vinylTexture?: boolean;
  centerDisplay?: boolean;
  accent?: string;
  keyCamelot?: string | null;
}

const SIZES: Record<PlatterSize, number> = {
  compact: 140,
  standard: 180,
  "large-battle": 220,
};

function accentHex(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

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
  size = "standard",
  vinylTexture = true,
  centerDisplay = true,
  accent,
  keyCamelot,
}: PlatterProps) {
  const discRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ angle: number; position: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [timeMode, setTimeMode] = useState<"elapsed" | "remain">("elapsed");

  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  // Satu putaran piringan = 1.8 detik audio (33 1/3 RPM DJ turntable standard)
  const rotation = ((position % 1.8) / 1.8) * 360;
  const dimension = SIZES[size] ?? SIZES.standard;
  const color = accentHex(accent, "#00e5ff");

  const angleAt = (clientX: number, clientY: number) => {
    const element = discRef.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      angle: angleAt(event.clientX, event.clientY),
      position,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || disabled) return;

    const angle = angleAt(event.clientX, event.clientY);
    let delta = angle - drag.angle;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    drag.angle = angle;

    if (mode === "vinyl") {
      drag.position = Math.max(0, Math.min(drag.position + (delta / 360) * 1.8, duration || drag.position));
      onScratch(drag.position);
    } else {
      onBend(Math.min(1.6, Math.max(0.4, 1 + delta * 0.012)));
    }
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (mode === "cdj") {
      onBendEnd();
    }
  };

  // Center LCD display radius & sizes
  const centerRadius = dimension * 0.28;
  const displayTime = timeMode === "elapsed" ? formatTime(position) : `-${formatTime(Math.max(0, duration - position))}`;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* 3D Hardware Jog Wheel Assembly */}
      <div
        ref={discRef}
        className={`relative select-none rounded-full flex items-center justify-center ${
          disabled ? "opacity-50 pointer-events-none" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{
          width: dimension,
          height: dimension,
          background: "radial-gradient(circle at 40% 35%, #334155 0%, #1e293b 45%, #050911 100%)",
          boxShadow: `
            0 12px 28px -6px rgba(0, 0, 0, 0.95),
            inset 0 1px 2px rgba(255, 255, 255, 0.35),
            inset 0 -3px 6px rgba(0, 0, 0, 0.9),
            0 0 0 2px #0a0f18
          `,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        role="slider"
        aria-label={`Platter ${mode === "vinyl" ? "Vinyl Scratch" : "CDJ Pitch Bend"}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        tabIndex={0}
      >
        {/* Outer Knurled Aluminum Bezel Rim (Pioneer CDJ Milled Grips) */}
        <div
          className="absolute inset-1 rounded-full pointer-events-none"
          style={{
            background: `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.09) 0deg 2deg, transparent 2deg 6deg)`,
            borderRadius: "50%",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -2px 4px rgba(255,255,255,0.1)",
          }}
        />

        {/* 360° Neon LED Progress Ring */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-2 pointer-events-none w-[calc(100%-16px)] h-[calc(100%-16px)] overflow-visible"
        >
          {/* Base Dim Ring */}
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeOpacity="0.4"
          />

          {/* Active Glowing Track Progress Ring */}
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeDasharray={`${2 * Math.PI * 88 * progress} ${2 * Math.PI * 88}`}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            style={{
              filter: `drop-shadow(0 0 4px ${color})`,
            }}
          />
        </svg>

        {/* Rotating Platter Disc / Vinyl Grooves Surface */}
        <div
          className="absolute rounded-full flex items-center justify-center overflow-hidden"
          style={{
            width: dimension - 24,
            height: dimension - 24,
            background: vinylTexture
              ? "radial-gradient(circle at 45% 45%, #182230 0%, #0a111a 50%, #03060a 100%)"
              : "radial-gradient(circle at 40% 40%, #2a374a 0%, #131c26 60%, #090e15 100%)",
            boxShadow: "inset 0 4px 10px rgba(0,0,0,0.9), inset 0 -2px 5px rgba(255,255,255,0.1)",
          }}
        >
          {/* Concentric Vinyl Grooves Texture */}
          {vinylTexture && (
            <div
              className="absolute inset-0 pointer-events-none opacity-40"
              style={{
                backgroundImage: `
                  radial-gradient(circle, transparent 30%, rgba(255,255,255,0.06) 31%, transparent 32%),
                  radial-gradient(circle, transparent 45%, rgba(255,255,255,0.05) 46%, transparent 47%),
                  radial-gradient(circle, transparent 60%, rgba(255,255,255,0.06) 61%, transparent 62%),
                  radial-gradient(circle, transparent 75%, rgba(255,255,255,0.04) 76%, transparent 77%),
                  radial-gradient(circle, transparent 88%, rgba(255,255,255,0.05) 89%, transparent 90%)
                `,
              }}
            />
          )}

          {/* Anisotropic Specular Light Sheen (Refleksi Cahaya Vinyl Berputar) */}
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background: `conic-gradient(from ${rotation}deg, transparent 0deg, rgba(255,255,255,0.18) 60deg, transparent 120deg, transparent 180deg, rgba(255,255,255,0.18) 240deg, transparent 300deg)`,
              transition: dragging ? "none" : "transform 90ms linear",
            }}
          />

          {/* Rotating Platter Marker Arm & Dot */}
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: dragging ? "none" : "transform 90ms linear",
            }}
          >
            {/* White/Accent Needle Marker Line */}
            <div
              className="absolute top-1 w-1.5 rounded-full"
              style={{
                height: "32%",
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}, 0 0 10px ${color}`,
              }}
            />
          </div>
        </div>

        {/* Center LCD Display Bezel & Screen (Pioneer On-Jog Display 3D) */}
        {centerDisplay ? (
          <div
            className="relative rounded-full flex flex-col items-center justify-center pointer-events-auto cursor-pointer"
            style={{
              width: centerRadius * 2,
              height: centerRadius * 2,
              backgroundColor: "#03070d",
              border: "2px solid #1e293b",
              boxShadow: `
                inset 0 3px 8px rgba(0, 0, 0, 0.95),
                inset 0 0 6px rgba(0, 0, 0, 0.9),
                0 4px 10px rgba(0, 0, 0, 0.8),
                0 0 0 1px rgba(255, 255, 255, 0.08)
              `,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setTimeMode(timeMode === "elapsed" ? "remain" : "elapsed");
            }}
            title="Klik untuk beralih waktu Elapsed / Remaining"
          >
            {/* Status Pulse Dot */}
            <div className="flex items-center gap-1 mb-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  playing ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
                style={{ filter: `drop-shadow(0 0 3px ${playing ? "#10b981" : "#f59e0b"})` }}
              />
              <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400">
                {playing ? "PLAY" : "CUE"}
              </span>
            </div>

            {/* Time Readout */}
            <span className="font-mono font-black text-xs md:text-sm tracking-tight text-slate-100">
              {displayTime}
            </span>

            {/* BPM & Key Sub-Readout */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[8.5px] font-mono font-bold text-cyan-300">
                {formatBpm(bpm)}
              </span>
              {keyCamelot && (
                <span className="text-[8px] font-mono font-bold px-1 py-0.2 rounded bg-slate-900 border border-slate-700 text-magenta">
                  {keyCamelot}
                </span>
              )}
            </div>

            {/* Inner Needle Rotation Ring in LCD */}
            <div
              className="absolute inset-1 rounded-full pointer-events-none"
              style={{
                border: "1px dashed rgba(255, 255, 255, 0.15)",
              }}
            />
          </div>
        ) : (
          <div
            className="rounded-full flex items-center justify-center pointer-events-none"
            style={{
              width: 32,
              height: 32,
              backgroundColor: "#080e18",
              border: "2px solid #334155",
              boxShadow: "0 2px 5px rgba(0,0,0,0.8)",
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          </div>
        )}
      </div>

      {/* Hardware Platter Mode Switch & Pitch Bend Buttons */}
      <div className="flex items-center gap-1.5 mt-1">
        <div className="flex rounded-md p-0.5 bg-slate-900/90 border border-slate-800 shadow-inner">
          <button
            type="button"
            className={`px-2.5 py-1 rounded text-[9.5px] font-bold tracking-wider transition-all cursor-pointer ${
              mode === "vinyl"
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => onModeChange("vinyl")}
            title="Mode Vinyl: Drag permukaan piringan untuk scratch realistis"
          >
            VINYL
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded text-[9.5px] font-bold tracking-wider transition-all cursor-pointer ${
              mode === "cdj"
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => onModeChange("cdj")}
            title="Mode CDJ: Drag piringan untuk pitch bend sementara (nudge tempo)"
          >
            CDJ
          </button>
        </div>

        {/* Pitch Bend Nudge Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="w-6 h-6 rounded bg-slate-900 border border-slate-700/80 text-slate-300 font-bold text-xs flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
            onPointerDown={() => onBend(0.94)}
            onPointerUp={() => onBendEnd()}
            onPointerLeave={() => onBendEnd()}
            title="Nudge Slow Down (-)"
          >
            −
          </button>
          <button
            type="button"
            className="w-6 h-6 rounded bg-slate-900 border border-slate-700/80 text-slate-300 font-bold text-xs flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
            onPointerDown={() => onBend(1.06)}
            onPointerUp={() => onBendEnd()}
            onPointerLeave={() => onBendEnd()}
            title="Nudge Speed Up (+)"
          >
            +
          </button>
        </div>
      </div>

      <div className="text-[9.5px] font-mono text-slate-400 flex items-center gap-2">
        <span>CUE {formatTime(cue)}</span>
        <span>•</span>
        <span>BPM {formatBpm(bpm)}</span>
      </div>
    </div>
  );
}
