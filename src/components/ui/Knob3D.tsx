import { useCallback, useRef, useState } from "react";

interface Knob3DProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  display?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  accentColor?: string;
  bipolar?: boolean;
  hint?: string;
}

const SIZE_MAP = {
  sm: { width: 42, height: 42, radius: 17, stroke: 3, labelSize: "text-[9px]" },
  md: { width: 54, height: 54, radius: 22, stroke: 3.5, labelSize: "text-[10px]" },
  lg: { width: 66, height: 66, radius: 27, stroke: 4, labelSize: "text-[11px]" },
};

export function Knob3D({
  label,
  value,
  min,
  max,
  step = 0.5,
  defaultValue = 0,
  onChange,
  display,
  disabled = false,
  size = "md",
  accentColor = "#00e5ff",
  bipolar = false,
  hint,
}: Knob3DProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const config = SIZE_MAP[size];
  const range = max - min;
  const clampedVal = Math.min(max, Math.max(min, value));
  const fraction = range > 0 ? (clampedVal - min) / range : 0.5;

  // Sudut putaran dari -135° (jam 7:30) sampai +135° (jam 4:30) = total 270°
  const angleDeg = -135 + fraction * 270;

  // SVG Arc calculation
  const startAngle = -135;
  const endAngle = 135;
  const currentAngle = angleDeg;

  const polarToCartesian = useCallback((centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  }, []);

  const describeArc = useCallback(
    (x: number, y: number, radius: number, startA: number, endA: number) => {
      const start = polarToCartesian(x, y, radius, endA);
      const end = polarToCartesian(x, y, radius, startA);
      const largeArcFlag = endA - startA <= 180 ? "0" : "1";
      return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
    },
    [polarToCartesian],
  );

  const center = config.width / 2;
  const arcRadius = config.radius;

  // Background track arc (-135° to +135°)
  const bgArcPath = describeArc(center, center, arcRadius, startAngle, endAngle);

  // Value arc path
  let valArcPath = "";
  if (bipolar) {
    // Berangkat dari jam 12 (0°)
    if (angleDeg > 0) {
      valArcPath = describeArc(center, center, arcRadius, 0, angleDeg);
    } else if (angleDeg < 0) {
      valArcPath = describeArc(center, center, arcRadius, angleDeg, 0);
    }
  } else {
    // Berangkat dari sudut awal (-135°)
    if (angleDeg > startAngle) {
      valArcPath = describeArc(center, center, arcRadius, startAngle, angleDeg);
    }
  }

  // Pointer drag events
  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: clampedVal };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragRef.current || disabled) return;
    const deltaY = dragRef.current.startY - e.clientY;
    const sensitivity = e.shiftKey ? range * 0.001 : range * 0.006;
    let nextVal = dragRef.current.startVal + deltaY * sensitivity;

    if (step > 0) {
      nextVal = Math.round(nextVal / step) * step;
    }
    nextVal = Math.min(max, Math.max(min, nextVal));
    onChange(nextVal);
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragRef.current = null;
  };

  // Mouse wheel support
  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const delta = (e.shiftKey ? step * 0.5 : step * 1) * dir;
    let nextVal = clampedVal + delta;
    nextVal = Math.min(max, Math.max(min, nextVal));
    onChange(Number(nextVal.toFixed(2)));
  };

  // Double click reset
  const handleDoubleClick = () => {
    if (disabled) return;
    onChange(defaultValue);
  };

  return (
    <div
      className={`flex flex-col items-center select-none ${disabled ? "opacity-45 pointer-events-none" : ""}`}
      title={hint || `${label}: ${display ?? clampedVal} (Double-click untuk reset)`}
    >
      {/* Label atas */}
      <span className={`field-label ${config.labelSize} text-slate-300 font-bold mb-1 tracking-wider`}>
        {label}
      </span>

      {/* 3D Rotary Knob Body */}
      <div
        className="relative cursor-ns-resize flex items-center justify-center"
        style={{ width: config.width, height: config.height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        {/* SVG Arc Ring LEDs */}
        <svg
          width={config.width}
          height={config.height}
          className="absolute inset-0 pointer-events-none overflow-visible"
        >
          {/* Base track */}
          <path
            d={bgArcPath}
            fill="none"
            stroke="#1e293b"
            strokeWidth={config.stroke}
            strokeLinecap="round"
          />

          {/* Active LED glowing arc */}
          {valArcPath && (
            <path
              d={valArcPath}
              fill="none"
              stroke={accentColor}
              strokeWidth={config.stroke}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 3px ${accentColor})`,
              }}
            />
          )}

          {/* Center detent mark (for bipolar knobs) */}
          {bipolar && (
            <circle
              cx={center}
              cy={center - arcRadius}
              r={1.5}
              fill={Math.abs(clampedVal) < 0.1 ? accentColor : "#64748b"}
            />
          )}
        </svg>

        {/* 3D Tactile Knob Cap (Pioneer Ribbed Beveled Cylinder) */}
        <div
          className="relative rounded-full flex items-center justify-center transition-transform duration-75"
          style={{
            width: config.width - 12,
            height: config.height - 12,
            background: "radial-gradient(circle at 35% 30%, #475569 0%, #1e293b 50%, #090d14 100%)",
            boxShadow: `
              0 4px 8px rgba(0, 0, 0, 0.8),
              inset 0 1px 1px rgba(255, 255, 255, 0.4),
              inset 0 -2px 3px rgba(0, 0, 0, 0.9),
              0 0 0 1px #0f172a
            `,
            transform: `rotate(${angleDeg}deg)`,
          }}
        >
          {/* Outer Ribbed Rubber Teeth Texture (Knurling) */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.06) 0deg 5deg, transparent 5deg 15deg)`,
              borderRadius: "50%",
            }}
          />

          {/* Inner Cap Metallic Bevel */}
          <div
            className="rounded-full flex items-center justify-center relative"
            style={{
              width: "70%",
              height: "70%",
              background: "linear-gradient(135deg, #334155 0%, #0f172a 100%)",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.25), inset 0 -1px 2px rgba(0,0,0,0.8)",
            }}
          >
            {/* Illuminated LED Indicator Line / Pointer */}
            <div
              className="absolute w-1 rounded-full top-1"
              style={{
                height: "40%",
                backgroundColor: accentColor,
                boxShadow: `0 0 5px ${accentColor}, 0 0 8px ${accentColor}`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Digital Readout Display */}
      {display && (
        <span className="readout text-[9.5px] font-mono text-cyan-300 font-bold mt-1 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
          {display}
        </span>
      )}
    </div>
  );
}
