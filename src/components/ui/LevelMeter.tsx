import { formatDb, peakToDb } from "../../lib/format";

const DEFAULT_SEGMENTS = 24;

interface LevelMeterProps {
  peak: number;
  /** Peak per channel bila ingin meter L/R independen. */
  peaks?: [number, number];
  /** Label kanal, default L/R untuk tampilan stereo. */
  channelLabels?: [string, string];
  orientation?: "horizontal" | "vertical";
  heightPx?: number;
  compact?: boolean;
}

export function LevelMeter({
  peak,
  peaks,
  channelLabels = ["L", "R"],
  orientation = "horizontal",
  heightPx = 140,
  compact = false,
}: LevelMeterProps) {
  const values = peaks ?? [peak, peak];
  const headline = Math.max(values[0], values[1]);
  const db = peakToDb(headline);
  const clip = db >= -0.1;

  if (orientation === "vertical") {
    const segments = 18;
    return (
      <div
        className="flex flex-col items-center justify-between rounded bg-[#040810] border border-[#182638] p-1.5 shadow-inner"
        style={{ height: heightPx }}
        title={`Peak: ${formatDb(db)}`}
      >
        <span
          className={`font-mono text-[8px] font-bold tracking-tighter ${
            clip ? "text-red-500 animate-pulse" : "text-slate-500"
          }`}
        >
          {clip ? "CLIP" : "dB"}
        </span>

        <div className="flex gap-1 items-center justify-center flex-1 my-1">
          {channelLabels.map((channel, cIdx) => {
            const channelDb = peakToDb(values[cIdx] ?? headline);
            const litSegments = Math.round(((channelDb + 60) / 60) * segments);

            return (
              <div
                key={channel}
                className="flex flex-col-reverse gap-[2px] w-2.5 h-full justify-between py-0.5"
              >
                {Array.from({ length: segments }, (_, index) => {
                  const active = index < litSegments;
                  // Segment warna: atas merah (clip), tengah oranye/kuning, bawah hijau/cyan
                  const isClip = index >= segments - 2;
                  const isWarn = index >= segments - 5 && !isClip;
                  const isMid = index >= segments - 9 && !isWarn && !isClip;

                  let activeColor = "#00e5ff"; // Cyan
                  if (isClip) activeColor = "#ef4444"; // Red
                  else if (isWarn) activeColor = "#f59e0b"; // Amber
                  else if (isMid) activeColor = "#84cc16"; // Lime

                  return (
                    <span
                      key={index}
                      className="w-full h-1 rounded-[1px] transition-colors duration-75"
                      style={{
                        backgroundColor: active ? activeColor : "#0b121e",
                        boxShadow: active
                          ? `0 0 4px ${activeColor}99, inset 0 0 1px #fff`
                          : "none",
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        <span className="font-mono text-[7.5px] text-slate-500">
          {formatDb(db).replace(" dB", "")}
        </span>
      </div>
    );
  }

  // Horizontal Mode
  const segments = compact ? 16 : DEFAULT_SEGMENTS;

  return (
    <div className={`rounded-lg border border-line bg-[#050a10] ${compact ? "p-2" : "p-3"}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label text-[10px]">Peak Meter</span>
        <span
          className={`readout text-xs ${clip ? "text-danger font-bold" : "text-ink-dim"}`}
          aria-live="off"
        >
          {formatDb(db)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {channelLabels.map((channel, channelIndex) => {
          const channelDb = peakToDb(values[channelIndex] ?? headline);
          const litSegments = Math.round(((channelDb + 60) / 60) * segments);
          return (
            <div key={channel} className="flex items-center gap-2">
              <span className="w-3 text-center font-mono text-[10px] text-ink-faint">
                {channel}
              </span>
              <div className="flex flex-1 gap-[3px]">
                {Array.from({ length: segments }, (_, index) => {
                  const active = index < litSegments;
                  const tone =
                    index >= segments - 2
                      ? "bg-danger"
                      : index >= segments - 6
                        ? "bg-amber"
                        : index >= segments - 12
                          ? "bg-lime"
                          : "bg-cyan";
                  return (
                    <span
                      key={index}
                      className={`h-2.5 flex-1 rounded-[1px] transition-colors duration-75 ${
                        active ? `${tone} shadow-[0_0_6px_currentColor]` : "bg-deck-700/60"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-1.5 flex justify-between pl-5 font-mono text-[9px] text-ink-faint">
          <span>-60</span>
          <span>-40</span>
          <span>-20</span>
          <span>-12</span>
          <span>-6</span>
          <span>0 dB</span>
        </div>
      )}
    </div>
  );
}
