interface PioneerButtonProps {
  type: "play" | "cue";
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  size?: "standard" | "compact";
}

export function PioneerButton({
  type,
  active = false,
  disabled = false,
  onClick,
  title,
  size = "standard",
}: PioneerButtonProps) {
  const isPlay = type === "play";
  const diameter = size === "standard" ? 64 : 52;
  const innerDiameter = size === "standard" ? 54 : 44;

  const colorHex = isPlay ? "#10b981" : "#f59e0b"; // Hijau untuk Play, Amber untuk Cue
  const glowShadow = active
    ? `0 0 16px ${colorHex}, 0 0 30px ${colorHex}55`
    : `0 0 4px ${colorHex}44`;

  return (
    <div
      className={`pioneer-btn-outer ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      style={{ width: diameter, height: diameter }}
      title={title || (isPlay ? "PLAY / PAUSE (Space)" : "CUE Return")}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="pioneer-btn-inner relative group"
        style={{
          width: innerDiameter,
          height: innerDiameter,
          backgroundColor: "#0d1520",
          border: `2px solid ${active ? colorHex : "#334155"}`,
          boxShadow: glowShadow,
        }}
      >
        {isPlay ? (
          /* PLAY / PAUSE Icon */
          <div className="flex flex-col items-center justify-center">
            <svg
              className={`w-6 h-6 transition-all ${
                active ? "text-emerald-400" : "text-emerald-600/70 group-hover:text-emerald-400"
              }`}
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{
                filter: active ? `drop-shadow(0 0 6px ${colorHex})` : "none",
              }}
            >
              {active ? (
                /* Icon PAUSE */
                <g>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </g>
              ) : (
                /* Icon PLAY */
                <polygon points="6 4 20 12 6 20 6 4" />
              )}
            </svg>
            <span
              className={`text-[8.5px] font-black tracking-widest leading-none mt-0.5 ${
                active ? "text-emerald-300" : "text-emerald-600/80"
              }`}
            >
              {active ? "PAUSE" : "PLAY"}
            </span>
          </div>
        ) : (
          /* CUE Button */
          <div className="flex flex-col items-center justify-center">
            <span
              className={`text-base font-black tracking-wider leading-none ${
                active ? "text-amber-300" : "text-amber-500/70 group-hover:text-amber-400"
              }`}
              style={{
                filter: active ? `drop-shadow(0 0 6px ${colorHex})` : "none",
              }}
            >
              CUE
            </span>
          </div>
        )}

        {/* Tactile Highlight Refraction Ring */}
        <div className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-b from-white/10 to-transparent" />
      </button>
    </div>
  );
}
