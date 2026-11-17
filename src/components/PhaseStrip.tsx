import { Panel } from "./ui/Panel";

interface Phase {
  number: number;
  title: string;
  detail: string;
  state: "selesai" | "berikutnya" | "rencana";
}

const PHASES: Phase[] = [
  { number: 1, title: "Scaffold + Audio I/O", detail: "Tauri 2, CPAL, deteksi device, test tone", state: "selesai" },
  { number: 2, title: "Decoder + Deck", detail: "Symphonia, transport, cue, waveform", state: "selesai" },
  { number: 3, title: "Time-stretch + Key lock", detail: "Pitch, keyshift, BPM/beatgrid/key", state: "selesai" },
  { number: 4, title: "Mixer", detail: "EQ, filter, crossfader, limiter, cue", state: "selesai" },
  { number: 5, title: "Dua Deck Penuh", detail: "Sync, jog wheel, hot cue, loop, beat jump", state: "selesai" },
  { number: 6, title: "FX + Auto DJ", detail: "Rantai 3 slot, transisi beat-synced", state: "selesai" },
  { number: 7, title: "Remixer + Sequencer", detail: "Pad grid, bank, step sequencer", state: "rencana" },
  { number: 8, title: "Library", detail: "SQLite, scan, playlist, analisis batch", state: "rencana" },
  { number: 9, title: "MIDI + Keyboard", detail: "MIDI Learn, mapping preset", state: "rencana" },
  { number: 10, title: "Skin Engine", detail: "Manifest JSON, 4 template, theme editor", state: "rencana" },
  { number: 11, title: "Rekaman + Polish", detail: "WAV/FLAC, audio settings, performa", state: "rencana" },
  { number: 12, title: "Packaging + CI/CD", detail: "MSI/NSIS, DMG, DEB/RPM/AppImage", state: "rencana" },
];

const STATE_STYLES: Record<Phase["state"], string> = {
  selesai: "border-lime/40 bg-lime/10 text-lime",
  berikutnya: "border-cyan/40 bg-cyan/10 text-cyan-soft",
  rencana: "border-line bg-white/[0.02] text-ink-faint",
};

const STATE_LABEL: Record<Phase["state"], string> = {
  selesai: "Selesai",
  berikutnya: "Berikutnya",
  rencana: "Rencana",
};

export function PhaseStrip() {
  return (
    <Panel
      title="Roadmap 12 Fase"
      subtitle="Setiap fase harus bisa dikompilasi dan dijalankan sebelum lanjut."
      actions={<span className="chip">6 / 12 selesai</span>}
    >
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PHASES.map((phase) => (
          <li
            key={phase.number}
            className={`rounded-lg border px-3 py-2.5 ${STATE_STYLES[phase.state]}`}
          >
            <div className="flex items-center gap-2">
              <span className="readout text-[11px] opacity-70">
                {String(phase.number).padStart(2, "0")}
              </span>
              <span className="truncate text-[12.5px] font-semibold text-ink">
                {phase.title}
              </span>
              <span className="ml-auto shrink-0 rounded-full border border-current/30 px-1.5 py-px text-[9px] uppercase tracking-wider">
                {STATE_LABEL[phase.state]}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug opacity-80">{phase.detail}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
