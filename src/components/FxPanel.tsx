import { useEffect, useState } from "react";

import type { AutoDjState, FxParams, FxSlotParams, FxType } from "../lib/ipc";
import { useAutoDjStore } from "../stores/autoDjStore";
import { useFxStore } from "../stores/fxStore";
import { Panel } from "./ui/Panel";
import { Knob3D } from "./ui/Knob3D";
import { Slider } from "./ui/Slider";

const FX_OPTIONS: Array<{ value: FxType; label: string }> = [
  { value: "bypass", label: "BYPASS" },
  { value: "delay", label: "DELAY" },
  { value: "echo", label: "ECHO" },
  { value: "reverb", label: "REVERB" },
  { value: "flanger", label: "FLANGER" },
  { value: "phaser", label: "PHASER" },
  { value: "chorus", label: "CHORUS" },
  { value: "bitcrusher", label: "BITCRUSH" },
  { value: "gater", label: "GATER" },
  { value: "trans", label: "TRANS" },
  { value: "roll", label: "ROLL" },
  { value: "brake", label: "BRAKE" },
  { value: "filter-sweep", label: "FILTER SW" },
  { value: "noise", label: "NOISE" },
  { value: "wah", label: "WAH" },
];

const CHAIN_LABELS = ["Deck A FX", "Deck B FX", "Master FX"];

const AUTO_DJ_STATE_LABEL: Record<AutoDjState, string> = {
  disabled: "OFF",
  armed: "ARMED",
  transitioning: "MIXING",
  cooldown: "COOLDOWN",
};

function slotLabel(slot: number): string {
  return `Slot ${slot + 1}`;
}

function updateSlot(
  fx: ReturnType<typeof useFxStore.getState>,
  chain: number,
  slot: number,
  patch: Partial<FxSlotParams>,
) {
  void fx.update({ chain, slot, ...patch });
}

export function FxPanel() {
  const fx = useFxStore((state) => state.status);
  const refreshFx = useFxStore((state) => state.refresh);

  const clearFxError = useFxStore((state) => state.clearError);
  const fxError = useFxStore((state) => state.error);

  const [chainIndex, setChainIndex] = useState(0);

  const autoDj = useAutoDjStore((state) => state.status);
  const refreshAutoDj = useAutoDjStore((state) => state.refresh);
  const updateAutoDj = useAutoDjStore((state) => state.update);
  const triggerAutoDj = useAutoDjStore((state) => state.trigger);
  const cancelAutoDj = useAutoDjStore((state) => state.cancel);
  const autoDjError = useAutoDjStore((state) => state.error);
  const clearAutoDjError = useAutoDjStore((state) => state.clearError);

  useEffect(() => {
    void refreshFx();
    void refreshAutoDj();
  }, [refreshFx, refreshAutoDj]);

  const chain = fx?.chains[chainIndex];
  const fallback: FxParams = {
    chains: [
      { slots: [defaultSlot(), defaultSlot(), defaultSlot()] },
      { slots: [defaultSlot(), defaultSlot(), defaultSlot()] },
      { slots: [defaultSlot(), defaultSlot(), defaultSlot()] },
    ],
  };
  const data = chain ? fx! : fallback;
  const panelError = fxError ?? autoDjError;

  return (
    <Panel
      title="FX & Auto DJ"
      subtitle="3 slot per rantai · wet/dry · parameter · Auto DJ crossfade"
      actions={
        <div className="flex gap-1">
          {CHAIN_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`btn px-2 py-1 text-[10px] ${
                chainIndex === index ? "btn-primary" : ""
              }`}
              onClick={() => setChainIndex(index)}
              aria-pressed={chainIndex === index}
            >
              {index === 0 ? "A" : index === 1 ? "B" : "MST"}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-3">
        {data.chains[chainIndex].slots.map((slot, slotIndex) => (
          <section
            key={slotIndex}
            className="rounded-lg border border-line bg-deck-850/60 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="field-label">{slotLabel(slotIndex)}</span>
              <button
                type="button"
                className={`btn px-2 py-1 text-[10px] ${slot.enabled ? "btn-primary" : ""}`}
                onClick={() =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, {
                    enabled: !slot.enabled,
                  })
                }
                aria-pressed={slot.enabled}
              >
                {slot.enabled ? "ON" : "OFF"}
              </button>
            </div>

            <select
              className="mt-2 w-full rounded border border-line bg-deck-900 px-2 py-1 text-[11px] text-ink"
              value={slot.fxType}
              onChange={(event) =>
                updateSlot(useFxStore.getState(), chainIndex, slotIndex, {
                  fxType: event.target.value as FxType,
                })
              }
            >
              {FX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="mt-3 flex items-center justify-around gap-2 p-2 rounded-lg bg-[#070b13] border border-[#162130]">
              <Knob3D
                label="WET/DRY"
                size="sm"
                value={slot.wet}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { wet: value })
                }
                display={`${Math.round(slot.wet * 100)}%`}
                accentColor="#c084fc"
              />
              <Knob3D
                label="PARAM 1"
                size="sm"
                value={slot.p1}
                min={1}
                max={2000}
                step={1}
                defaultValue={100}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { p1: value })
                }
                display={slot.p1.toFixed(0)}
                accentColor="#e879f9"
              />
              <Knob3D
                label="PARAM 2"
                size="sm"
                value={slot.p2}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.5}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { p2: value })
                }
                display={slot.p2.toFixed(2)}
                accentColor="#38bdf8"
              />
              <Knob3D
                label="PARAM 3"
                size="sm"
                value={slot.p3}
                min={0.01}
                max={32}
                step={0.01}
                defaultValue={1}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { p3: value })
                }
                display={slot.p3.toFixed(2)}
                accentColor="#a3e635"
              />
            </div>
          </section>
        ))}
      </div>

      <section className="mt-3 rounded-lg border border-line bg-deck-850/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label">Auto DJ</span>
          <div className="flex items-center gap-2">
            <span
              className={`chip ${
                autoDj?.state === "transitioning" ? "text-cyan-soft" : ""
              }`}
            >
              {AUTO_DJ_STATE_LABEL[autoDj?.state ?? "disabled"]}
            </span>
            <button
              type="button"
              className={`btn px-2 py-1 text-[10px] ${
                autoDj?.enabled ? "btn-primary" : ""
              }`}
              onClick={() => void updateAutoDj({ enabled: !autoDj?.enabled })}
              aria-pressed={Boolean(autoDj?.enabled)}
            >
              {autoDj?.enabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-[11px] text-ink-dim">
            <input
              type="checkbox"
              checked={autoDj?.autoStart ?? true}
              onChange={(event) =>
                void updateAutoDj({ autoStart: event.target.checked })
              }
            />
            Mulai otomatis di akhir track
          </label>
          <label className="flex items-center gap-2 text-[11px] text-ink-dim">
            <input
              type="checkbox"
              checked={autoDj?.beatmatch ?? true}
              onChange={(event) =>
                void updateAutoDj({ beatmatch: event.target.checked })
              }
            />
            Beat-match BPM + fase
          </label>
        </div>

        <div className="mt-2">
          <Slider
            id="autodj-crossfade"
            label="Panjang crossfade"
            value={autoDj?.crossfadeBeats ?? 16}
            min={2}
            max={64}
            step={1}
            onChange={(value) => void updateAutoDj({ crossfadeBeats: value })}
            display={`${autoDj?.crossfadeBeats ?? 16} beat`}
          />
        </div>

        <div className="mt-3 rounded-lg border border-line bg-deck-900/70 p-2">
          <div className="flex items-center justify-between text-[10.5px] text-ink-dim">
            <span>
              Deck {(autoDj?.activeDeck ?? 0) === 0 ? "A" : "B"} → Deck{" "}
              {(autoDj?.nextDeck ?? 1) === 0 ? "A" : "B"}
            </span>
            <span className="readout">
              {autoDj?.state === "transitioning"
                ? `${(autoDj.crossfadeSecs * (1 - autoDj.progress)).toFixed(1)} s`
                : `${(autoDj?.crossfadeBeats ?? 16)} beat`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta transition-[width] duration-100"
              style={{
                width: `${Math.round((autoDj?.progress ?? 0) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-primary px-2 py-1 text-[10px]"
            disabled={!autoDj?.enabled || autoDj.state === "transitioning"}
            onClick={() => void triggerAutoDj()}
          >
            Mulai transisi
          </button>
          <button
            type="button"
            className="btn px-2 py-1 text-[10px]"
            disabled={autoDj?.state !== "transitioning"}
            onClick={() => void cancelAutoDj()}
          >
            Batalkan
          </button>
        </div>

        {autoDj?.message ? (
          <p className="mt-2 text-[10px] leading-relaxed text-amber">
            {autoDj.message}
          </p>
        ) : (
          <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
            Transisi berjalan di engine Rust: target di-sync ke BPM/fase deck aktif,
            crossfader bergerak beat-synced, lalu deck lama di-pause. Assign channel
            A/B dan muat track di kedua deck.
          </p>
        )}
      </section>

      {panelError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger"
        >
          <span className="mt-0.5">▲</span>
          <p className="flex-1 whitespace-pre-wrap">{panelError}</p>
          <button
            type="button"
            onClick={() => {
              clearFxError();
              clearAutoDjError();
            }}
            className="rounded px-1 text-ink-dim hover:text-ink"
            aria-label="Tutup pesan error FX / Auto DJ"
          >
            ✕
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

function defaultSlot(): FxSlotParams {
  return {
    fxType: "bypass",
    enabled: false,
    wet: 0.5,
    p1: 375,
    p2: 0.35,
    p3: 0.5,
  };
}
