import { useRef, useState } from "react";

interface Fader3DProps {
  label?: string;
  value: number; // 0..1 (atau min..max)
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  orientation?: "vertical" | "horizontal";
  lengthPx?: number;
  display?: string;
  disabled?: boolean;
  accentColor?: string;
  ticks?: Array<{ value: number; label: string }>;
  hint?: string;
}

export function Fader3D({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue = 1,
  onChange,
  orientation = "vertical",
  lengthPx = 130,
  display,
  disabled = false,
  accentColor = "#00e5ff",
  ticks,
  hint,
}: Fader3DProps) {
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const range = max - min;
  const clampedVal = Math.min(max, Math.max(min, value));
  const fraction = range > 0 ? (clampedVal - min) / range : 0.5;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return;
    updateFromPointer(e);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const updateFromPointer = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();

    let frac = 0;
    if (orientation === "vertical") {
      // Y: 0 di bawah (min), lengthPx di atas (max)
      const y = e.clientY - rect.top;
      frac = 1 - Math.max(0, Math.min(1, y / rect.height));
    } else {
      // X: 0 di kiri (min), lengthPx di kanan (max)
      const x = e.clientX - rect.left;
      frac = Math.max(0, Math.min(1, x / rect.width));
    }

    let nextVal = min + frac * range;
    if (step > 0) {
      nextVal = Math.round(nextVal / step) * step;
    }
    nextVal = Math.min(max, Math.max(min, nextVal));
    onChange(Number(nextVal.toFixed(3)));
  };

  const handleDoubleClick = () => {
    if (disabled) return;
    onChange(defaultValue);
  };

  const isVertical = orientation === "vertical";

  // Posisi thumb dalam persen
  const percentPos = fraction * 100;

  return (
    <div
      className={`flex flex-col items-center select-none ${disabled ? "opacity-45 pointer-events-none" : ""}`}
      title={hint || `${label ?? "Fader"}: ${display ?? clampedVal}`}
    >
      {label && (
        <span className="field-label text-[10px] text-slate-300 font-bold mb-1 tracking-wider uppercase">
          {label}
        </span>
      )}

      <div className={`relative flex items-center justify-center ${isVertical ? "flex-row gap-2" : "flex-col gap-1"}`}>
        {/* Skala ticks di sebelah kiri jika vertikal */}
        {isVertical && ticks && (
          <div
            className="flex flex-col justify-between text-[8px] font-mono text-slate-500 text-right pr-1"
            style={{ height: lengthPx }}
          >
            {ticks.map((t, idx) => (
              <span key={idx} className="leading-none">
                {t.label}
              </span>
            ))}
          </div>
        )}

        {/* Fader Track Container */}
        <div
          ref={trackRef}
          className={`relative cursor-pointer flex items-center justify-center ${
            isVertical ? "w-8 py-2" : "h-8 px-2"
          }`}
          style={isVertical ? { height: lengthPx } : { width: lengthPx, maxWidth: "100%" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          {/* Sunken Metal Groove Slot */}
          <div
            className="fader-slot-3d absolute"
            style={
              isVertical
                ? { width: 6, height: "100%", top: 0, bottom: 0 }
                : { height: 6, width: "100%", left: 0, right: 0 }
            }
          />

          {/* Active Level Track Highlight */}
          <div
            className="absolute rounded-full pointer-events-none opacity-80"
            style={
              isVertical
                ? {
                    width: 3,
                    bottom: 0,
                    height: `${percentPos}%`,
                    backgroundColor: accentColor,
                    boxShadow: `0 0 6px ${accentColor}`,
                  }
                : {
                    height: 3,
                    left: 0,
                    width: `${percentPos}%`,
                    backgroundColor: accentColor,
                    boxShadow: `0 0 6px ${accentColor}`,
                  }
            }
          />

          {/* 3D Pioneer Hardware Fader Cap */}
          <div
            className="fader-cap-3d absolute flex items-center justify-center pointer-events-none"
            style={
              isVertical
                ? {
                    width: 32,
                    height: 20,
                    bottom: `calc(${percentPos}% - 10px)`,
                  }
                : {
                    width: 20,
                    height: 32,
                    left: `calc(${percentPos}% - 10px)`,
                  }
            }
          >
            {/* White/Accent Center Notch Line */}
            <div
              className="rounded-full"
              style={
                isVertical
                  ? {
                      width: "80%",
                      height: 2.5,
                      backgroundColor: "#f8fafc",
                      boxShadow: "0 0 4px rgba(255, 255, 255, 0.9)",
                    }
                  : {
                      height: "80%",
                      width: 2.5,
                      backgroundColor: "#f8fafc",
                      boxShadow: "0 0 4px rgba(255, 255, 255, 0.9)",
                    }
              }
            />
          </div>
        </div>

        {/* Skala ticks di sebelah bawah jika horizontal */}
        {!isVertical && ticks && (
          <div
            className="flex justify-between text-[8px] font-mono text-slate-500 w-full px-2"
            style={{ width: lengthPx }}
          >
            {ticks.map((t, idx) => (
              <span key={idx} className="leading-none">
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Digital Readout */}
      {display && (
        <span className="readout text-[9px] font-mono text-cyan-300 font-bold mt-1 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
          {display}
        </span>
      )}
    </div>
  );
}
