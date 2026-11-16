import { useEffect, useRef, useState } from "react";

import type { DeckId, FxParams, FxSlotParams, FxType } from "../lib/ipc";
import { useDeckAStore, useDeckBStore } from "../stores/deckStore";
import { useFxStore } from "../stores/fxStore";
import { useMixerStore } from "../stores/mixerStore";
import { Panel } from "./ui/Panel";
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
  const [autoDj, setAutoDj] = useState(false);
  const [crossfade, setCrossfade] = useState(8);
  const [beatmatch, setBeatmatch] = useState(true);
  const transitioning = useRef(false);

  useEffect(() => {
    void refreshFx();
  }, [refreshFx]);

  useEffect(() => {
    if (!autoDj) {
      return;
    }

    const timer = window.setInterval(() => {
      if (transitioning.current) {
        return;
      }

      const a = useDeckAStore.getState().status;
      const b = useDeckBStore.getState().status;
      const mixer = useMixerStore.getState().status;
      if (!a?.loaded || !b?.loaded) {
        return;
      }

      const cf = mixer?.crossfader ?? 0.5;
      const activeIsA = cf < 0.5;
      const active = activeIsA ? a : b;
      const remaining = active.durationSecs - active.positionSecs;
      if (!active.playing || remaining > crossfade + 3) {
        return;
      }

      const otherStore = activeIsA ? useDeckBStore : useDeckAStore;
      const other = otherStore.getState().status;
      if (!other || other.playing) {
        return;
      }

      transitioning.current = true;
      void (async () => {
        try {
          if (beatmatch) {
            const source = (activeIsA ? 0 : 1) as DeckId;
            const target = (activeIsA ? 1 : 0) as DeckId;
            await (await import("../lib/ipc")).ipc.syncDecks(source, target);
          }

          await otherStore.getState().seek(0);
          await otherStore.getState().play();

          const startCf = cf;
          const targetCf = activeIsA ? 1 : 0;
          const steps = Math.max(1, Math.round((crossfade * 1000) / 50));
          for (let index = 1; index <= steps; index += 1) {
            const value = startCf + (targetCf - startCf) * (index / steps);
            useMixerStore.getState().update({ crossfader: value });
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }

          const oldStore = activeIsA ? useDeckAStore : useDeckBStore;
          await oldStore.getState().pause();
        } finally {
          transitioning.current = false;
        }
      })();
    }, 250);

    return () => window.clearInterval(timer);
  }, [autoDj, crossfade, beatmatch]);

  const chain = fx?.chains[chainIndex];
  const fallback: FxParams = {
    chains: [
      { slots: [defaultSlot(), defaultSlot(), defaultSlot()] },
      { slots: [defaultSlot(), defaultSlot(), defaultSlot()] },
      { slots: [defaultSlot(), defaultSlot(), defaultSlot()] },
    ],
  };
  const data = chain ? fx! : fallback;

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

            <div className="mt-2">
              <Slider
                id={`fx-${chainIndex}-${slotIndex}-wet`}
                label="Wet/Dry"
                value={slot.wet}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { wet: value })
                }
                display={`${Math.round(slot.wet * 100)} %`}
              />
            </div>
            <div className="mt-2">
              <Slider
                id={`fx-${chainIndex}-${slotIndex}-p1`}
                label="Param 1"
                value={slot.p1}
                min={1}
                max={2000}
                step={1}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { p1: value })
                }
                display={slot.p1.toFixed(0)}
              />
            </div>
            <div className="mt-2">
              <Slider
                id={`fx-${chainIndex}-${slotIndex}-p2`}
                label="Param 2"
                value={slot.p2}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { p2: value })
                }
                display={slot.p2.toFixed(2)}
              />
            </div>
            <div className="mt-2">
              <Slider
                id={`fx-${chainIndex}-${slotIndex}-p3`}
                label="Param 3"
                value={slot.p3}
                min={0.01}
                max={32}
                step={0.01}
                onChange={(value) =>
                  updateSlot(useFxStore.getState(), chainIndex, slotIndex, { p3: value })
                }
                display={slot.p3.toFixed(2)}
              />
            </div>
          </section>
        ))}
      </div>

      <section className="mt-3 rounded-lg border border-line bg-deck-850/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label">Auto DJ</span>
          <button
            type="button"
            className={`btn px-2 py-1 text-[10px] ${autoDj ? "btn-primary" : ""}`}
            onClick={() => setAutoDj((value) => !value)}
            aria-pressed={autoDj}
          >
            {autoDj ? "ON" : "OFF"}
          </button>
        </div>
        <div className="mt-2">
          <Slider
            id="autodj-crossfade"
            label="Crossfade"
            value={crossfade}
            min={2}
            max={30}
            step={1}
            onChange={setCrossfade}
            display={`${crossfade} s`}
          />
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-ink-dim">
          <input
            type="checkbox"
            checked={beatmatch}
            onChange={(event) => setBeatmatch(event.target.checked)}
          />
          Beat-match otomatis (BPM + fase)
        </label>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
          Auto DJ bergantian antar dua deck yang sudah dimuat. Atur assign channel A/B dan
          crossfader default agar transisi terdengar.
        </p>
      </section>

      {fxError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger"
        >
          <span className="mt-0.5">▲</span>
          <p className="flex-1 whitespace-pre-wrap">{fxError}</p>
          <button
            type="button"
            onClick={clearFxError}
            className="rounded px-1 text-ink-dim hover:text-ink"
            aria-label="Tutup pesan error FX"
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
