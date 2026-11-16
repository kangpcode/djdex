interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  scale?: "linear" | "log";
  onChange: (value: number) => void;
  display: string;
  disabled?: boolean;
  hint?: string;
  onReset?: () => void;
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  scale = "linear",
  onChange,
  display,
  disabled,
  hint,
  onReset,
}: SliderProps) {
  const logarithmic = scale === "log";
  const safeMin = logarithmic ? Math.max(min, 0.001) : min;

  const toSlider = (raw: number) =>
    logarithmic ? Math.log(raw) : raw;
  const fromSlider = (raw: number) =>
    logarithmic ? Math.exp(raw) : raw;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <span className="readout text-sm text-cyan-soft">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        className="fader"
        min={toSlider(safeMin)}
        max={toSlider(max)}
        step={logarithmic ? 0.001 : step}
        value={toSlider(value)}
        disabled={disabled}
        onChange={(event) => onChange(fromSlider(Number(event.target.value)))}
        onDoubleClick={() => onReset?.()}
        aria-valuetext={display}
      />
      {hint ? <p className="text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
