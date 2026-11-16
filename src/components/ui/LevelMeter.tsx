import { formatDb, peakToDb } from "../../lib/format";

const SEGMENTS = 28;

interface LevelMeterProps {
  peak: number;
  /** Peak per channel bila ingin meter L/R independen. */
  peaks?: [number, number];
  /** Label kanal, default L/R untuk tampilan stereo. */
  channelLabels?: [string, string];
}

export function LevelMeter({
  peak,
  peaks,
  channelLabels = ["L", "R"],
}: LevelMeterProps) {
  const values = peaks ?? [peak, peak];
  const headline = Math.max(values[0], values[1]);
  const db = peakToDb(headline);
  const clip = db >= -0.1;

  return (
    <div className="rounded-lg border border-line bg-[#050a10] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label">Peak Meter</span>
        <span
          className={`readout text-xs ${clip ? "text-danger" : "text-ink-dim"}`}
          aria-live="off"
        >
          {formatDb(db)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {channelLabels.map((channel, channelIndex) => {
          const channelDb = peakToDb(values[channelIndex] ?? headline);
          const litSegments = Math.round(((channelDb + 60) / 60) * SEGMENTS);
          return (
          <div key={channel} className="flex items-center gap-2">
            <span className="w-3 text-center font-mono text-[10px] text-ink-faint">
              {channel}
            </span>
            <div className="flex flex-1 gap-[3px]">
              {Array.from({ length: SEGMENTS }, (_, index) => {
                const active = index < litSegments;
                const tone =
                  index >= SEGMENTS - 2
                    ? "bg-danger"
                    : index >= SEGMENTS - 7
                      ? "bg-amber"
                      : index >= SEGMENTS - 14
                        ? "bg-lime"
                        : "bg-cyan";
                return (
                  <span
                    key={index}
                    className={`h-2.5 flex-1 rounded-[1px] transition-colors duration-75 ${
                      active ? tone : "bg-deck-700/60"
                    }`}
                  />
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between pl-5 font-mono text-[9px] text-ink-faint">
        <span>-60</span>
        <span>-40</span>
        <span>-20</span>
        <span>-12</span>
        <span>-6</span>
        <span>0 dB</span>
      </div>
    </div>
  );
}
