import { useState } from "react";
import { useSkinStore } from "../stores/skinStore";
import { IconEdit, IconExport, IconImport, IconTrash } from "./ui/Icons";
import { Panel } from "./ui/Panel";
import type { PlatterSize, SkinManifest, WaveformOrientation, WaveformPosition } from "../lib/ipc";

export function SkinPanel() {
  const activeSkin = useSkinStore((s) => s.activeSkin);
  const skins = useSkinStore((s) => s.skins);
  const isLoading = useSkinStore((s) => s.isLoading);
  const error = useSkinStore((s) => s.error);

  const setSkin = useSkinStore((s) => s.setSkin);
  const saveCustomSkin = useSkinStore((s) => s.saveCustomSkin);
  const deleteSkin = useSkinStore((s) => s.deleteSkin);
  const exportSkinPack = useSkinStore((s) => s.exportSkinPack);
  const importSkinPack = useSkinStore((s) => s.importSkinPack);

  const [activeTab, setActiveTab] = useState<"gallery" | "editor">("gallery");

  // State untuk form editor kustom
  const [editorId, setEditorId] = useState("");
  const [editorName, setEditorName] = useState("");
  const [editorDesc, setEditorDesc] = useState("");
  const [primaryColor, setPrimaryColor] = useState(activeSkin?.theme.primaryColor ?? "#00e5ff");
  const [deckAColor, setDeckAColor] = useState(activeSkin?.theme.accentDeckA ?? "#00e5ff");
  const [deckBColor, setDeckBColor] = useState(activeSkin?.theme.accentDeckB ?? "#ff007f");
  const [bgColor, setBgColor] = useState(activeSkin?.theme.backgroundColor ?? "#090d16");
  const [surfaceColor, setSurfaceColor] = useState(activeSkin?.theme.surfaceColor ?? "#0e1526");
  const [borderColor, setBorderColor] = useState(activeSkin?.theme.panelBorderColor ?? "#1c2842");
  const [platterSize, setPlatterSize] = useState<PlatterSize>(activeSkin?.layout.platter.size ?? "standard");
  const [waveformOrient, setWaveformOrient] = useState<WaveformOrientation>(
    activeSkin?.layout.waveform.orientation ?? "horizontal",
  );
  const [waveformPos, setWaveformPos] = useState<WaveformPosition>(
    activeSkin?.layout.waveform.position ?? "top-stacked",
  );
  const [deckCount, setDeckCount] = useState<number>(activeSkin?.layout.deckCount ?? 2);
  const [showPhaseStrip, setShowPhaseStrip] = useState<boolean>(activeSkin?.layout.showPhaseStrip ?? true);
  const [showScratchPads, setShowScratchPads] = useState<boolean>(activeSkin?.layout.showScratchPads ?? false);

  const handleOpenEditorWithSkin = (s: SkinManifest) => {
    setEditorId(`${s.metadata.id}-custom`);
    setEditorName(`${s.metadata.name} (Custom)`);
    setEditorDesc(s.metadata.description);
    setPrimaryColor(s.theme.primaryColor);
    setDeckAColor(s.theme.accentDeckA);
    setDeckBColor(s.theme.accentDeckB);
    setBgColor(s.theme.backgroundColor);
    setSurfaceColor(s.theme.surfaceColor);
    setBorderColor(s.theme.panelBorderColor);
    setPlatterSize(s.layout.platter.size);
    setWaveformOrient(s.layout.waveform.orientation);
    setWaveformPos(s.layout.waveform.position);
    setDeckCount(s.layout.deckCount);
    setShowPhaseStrip(s.layout.showPhaseStrip);
    setShowScratchPads(s.layout.showScratchPads);
    setActiveTab("editor");
  };

  const handleSaveEditor = async () => {
    if (!editorId.trim() || !editorName.trim()) {
      alert("Harap isi ID dan Nama Skin!");
      return;
    }

    const manifest: SkinManifest = {
      metadata: {
        id: editorId.trim().toLowerCase().replace(/\s+/g, "-"),
        name: editorName.trim(),
        author: "User",
        version: "1.0.0",
        description: editorDesc.trim() || "Skin kustom buatan pengguna.",
      },
      theme: {
        primaryColor,
        accentDeckA: deckAColor,
        accentDeckB: deckBColor,
        backgroundColor: bgColor,
        surfaceColor,
        panelBorderColor: borderColor,
        textColor: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
      },
      layout: {
        deckCount: Number(deckCount),
        waveform: {
          position: waveformPos,
          orientation: waveformOrient,
          heightPx: waveformOrient === "vertical" ? 220 : 110,
          showBeatgrid: true,
        },
        platter: {
          size: platterSize,
          vinylTexture: true,
          centerDisplay: platterSize !== "large-battle",
        },
        mixer: {
          position: deckCount === 4 ? "center" : "center",
          channelCount: deckCount,
          vuMeterStyle: "segmented",
          crossfaderHeightPx: 56,
        },
        lowerPanelDefault: "library",
        showPhaseStrip,
        showScratchPads,
      },
    };

    await saveCustomSkin(manifest);
    setActiveTab("gallery");
  };

  const handleExport = async (skinId: string) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        filters: [{ name: "DJDeX Skin Pack (*.djdex-skin)", extensions: ["djdex-skin", "zip"] }],
        defaultPath: `${skinId}.djdex-skin`,
      });
      if (dest) {
        await exportSkinPack(skinId, dest);
        alert(`Skin '${skinId}' berhasil diekspor ke ${dest}`);
      }
    } catch {
      // Offline fallback
    }
  };

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "DJDeX Skin Pack (*.djdex-skin, *.zip)", extensions: ["djdex-skin", "zip"] }],
      });
      if (selected && typeof selected === "string") {
        await importSkinPack(selected);
        alert("Skin pack berhasil diimpor!");
      }
    } catch {
      // Offline fallback
    }
  };

  const isFactorySkin = (id: string) =>
    ["classic-club", "battle-scratch", "producer-remix", "tour-pro"].includes(id);

  return (
    <Panel
      title="Skin & Layout Engine 'Mesin Tampilan DJ Virtual'"
      subtitle="Pilih tema tata letak pabrikan, kustomisasi palet warna & piringan, atau ekspor/impor paket skin (.djdex-skin)"
    >
      {/* Top Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/60 bg-deck-900/60 p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("gallery")}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "gallery"
                ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                : "border-line bg-deck-950 text-ink-muted hover:text-ink"
            }`}
          >
            Galeri Template ({skins.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "editor"
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                : "border-line bg-deck-950 text-ink-muted hover:text-ink"
            }`}
          >
            Editor Visual & Tata Letak
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded border border-line bg-deck-800 px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink hover:bg-deck-700"
          >
            <IconImport className="w-3.5 h-3.5" /> Impor .djdex-skin
          </button>
          {activeSkin && (
            <button
              type="button"
              onClick={() => handleExport(activeSkin.metadata.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded border border-line bg-deck-800 px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink hover:bg-deck-700"
            >
              <IconExport className="w-3.5 h-3.5" /> Ekspor Skin Aktif
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Tab 1: Skin Gallery */}
      {activeTab === "gallery" && (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {skins.map((s) => {
            const isActive = activeSkin?.metadata.id === s.metadata.id;
            return (
              <div
                key={s.metadata.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition ${
                  isActive
                    ? "border-cyan-400 bg-cyan-950/20 shadow-[0_0_20px_rgba(0,229,255,0.2)]"
                    : "border-line/60 bg-deck-950/60 hover:border-line hover:bg-deck-950"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-ink">
                        {s.metadata.name}
                      </h3>
                      <p className="text-[11px] text-ink-faint font-mono">
                        by {s.metadata.author} · v{s.metadata.version}
                      </p>
                    </div>
                    {isActive ? (
                      <span className="rounded-full bg-cyan-500/20 border border-cyan-400 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                        AKTIF
                      </span>
                    ) : (
                      <span className="rounded-full bg-deck-800 px-2 py-0.5 text-[10px] font-mono text-ink-muted">
                        {isFactorySkin(s.metadata.id) ? "Pabrik" : "Kustom"}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-ink-muted line-clamp-3">
                    {s.metadata.description}
                  </p>

                  {/* Color Palettes Swatch */}
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-ink-faint">Palet:</span>
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/50 shadow"
                      style={{ backgroundColor: s.theme.primaryColor }}
                      title={`Primary: ${s.theme.primaryColor}`}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/50 shadow"
                      style={{ backgroundColor: s.theme.accentDeckA }}
                      title={`Deck A: ${s.theme.accentDeckA}`}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/50 shadow"
                      style={{ backgroundColor: s.theme.accentDeckB }}
                      title={`Deck B: ${s.theme.accentDeckB}`}
                    />
                    {s.theme.accentDeckC && (
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/50 shadow"
                        style={{ backgroundColor: s.theme.accentDeckC }}
                        title={`Deck C: ${s.theme.accentDeckC}`}
                      />
                    )}
                    {s.theme.accentDeckD && (
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/50 shadow"
                        style={{ backgroundColor: s.theme.accentDeckD }}
                        title={`Deck D: ${s.theme.accentDeckD}`}
                      />
                    )}
                  </div>

                  {/* Layout Features Badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded bg-deck-900 border border-line/40 px-1.5 py-0.5 text-[10px] font-mono text-ink-dim">
                      {s.layout.deckCount} Deck
                    </span>
                    <span className="rounded bg-deck-900 border border-line/40 px-1.5 py-0.5 text-[10px] font-mono text-ink-dim uppercase">
                      {s.layout.waveform.orientation} Wave
                    </span>
                    <span className="rounded bg-deck-900 border border-line/40 px-1.5 py-0.5 text-[10px] font-mono text-ink-dim capitalize">
                      {s.layout.platter.size.replace("-", " ")} Platter
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-line/40">
                  {isActive ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded bg-cyan-500/20 py-1.5 text-xs font-bold text-cyan-300 opacity-60"
                    >
                      Sedang Aktif
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setSkin(s.metadata.id)}
                      disabled={isLoading}
                      className="w-full rounded border border-cyan-500/50 bg-cyan-500/20 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30"
                    >
                      Terapkan Skin
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEditorWithSkin(s)}
                    className="flex items-center justify-center rounded border border-line bg-deck-850 p-2 text-xs font-medium text-ink-muted hover:text-ink"
                    title="Kustomisasi skin ini di editor"
                  >
                    <IconEdit className="w-3.5 h-3.5" />
                  </button>

                  {!isFactorySkin(s.metadata.id) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Hapus skin kustom '${s.metadata.name}'?`)) {
                          void deleteSkin(s.metadata.id);
                        }
                      }}
                      className="flex items-center justify-center rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300 hover:bg-red-500/20"
                      title="Hapus skin kustom"
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Visual Skin & Layout Editor */}
      {activeTab === "editor" && (
        <div className="p-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Metadata & Palet Warna */}
            <div className="space-y-4 rounded-xl border border-line/60 bg-deck-950/60 p-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-cyan-400">
                1. Metadata & Identitas Template
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    ID Template (Kebab-case)
                  </label>
                  <input
                    type="text"
                    value={editorId}
                    onChange={(e) => setEditorId(e.target.value)}
                    placeholder="misal: my-club-v2"
                    className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Nama Tampilan
                  </label>
                  <input
                    type="text"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    placeholder="misal: My Custom Club 2026"
                    className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Deskripsi Tata Letak
                </label>
                <textarea
                  value={editorDesc}
                  onChange={(e) => setEditorDesc(e.target.value)}
                  placeholder="Keterangan gaya layout, tujuan performa, dsb..."
                  rows={2}
                  className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ink-dim pt-2">
                Palet Warna Tema
              </h4>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[10px] text-ink-muted mb-1">Primary Accent</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-7 w-7 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-20 rounded border border-line bg-deck-900 px-1.5 py-0.5 text-xs font-mono text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-ink-muted mb-1">Deck A Accent</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={deckAColor}
                      onChange={(e) => setDeckAColor(e.target.value)}
                      className="h-7 w-7 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={deckAColor}
                      onChange={(e) => setDeckAColor(e.target.value)}
                      className="w-20 rounded border border-line bg-deck-900 px-1.5 py-0.5 text-xs font-mono text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-ink-muted mb-1">Deck B Accent</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={deckBColor}
                      onChange={(e) => setDeckBColor(e.target.value)}
                      className="h-7 w-7 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={deckBColor}
                      onChange={(e) => setDeckBColor(e.target.value)}
                      className="w-20 rounded border border-line bg-deck-900 px-1.5 py-0.5 text-xs font-mono text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-ink-muted mb-1">Background Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-7 w-7 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-20 rounded border border-line bg-deck-900 px-1.5 py-0.5 text-xs font-mono text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-ink-muted mb-1">Surface Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={surfaceColor}
                      onChange={(e) => setSurfaceColor(e.target.value)}
                      className="h-7 w-7 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={surfaceColor}
                      onChange={(e) => setSurfaceColor(e.target.value)}
                      className="w-20 rounded border border-line bg-deck-900 px-1.5 py-0.5 text-xs font-mono text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-ink-muted mb-1">Border Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="h-7 w-7 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="w-20 rounded border border-line bg-deck-900 px-1.5 py-0.5 text-xs font-mono text-ink"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Konfigurasi Tata Letak (Layout Engine) */}
            <div className="space-y-4 rounded-xl border border-line/60 bg-deck-950/60 p-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-emerald-400">
                2. Tata Letak & Komponen Visual
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Jumlah Deck
                  </label>
                  <select
                    value={deckCount}
                    onChange={(e) => setDeckCount(Number(e.target.value))}
                    className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:outline-none"
                  >
                    <option value={2}>2 Deck (Deck A &amp; B — didukung engine)</option>
                    <option value={4} disabled>
                      4 Deck (menunggu engine 4-deck — fase berikutnya)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Ukuran Platter / Jog Wheel
                  </label>
                  <select
                    value={platterSize}
                    onChange={(e) => setPlatterSize(e.target.value as PlatterSize)}
                    className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:outline-none"
                  >
                    <option value="standard">Standard Club CDJ (Center BPM LCD)</option>
                    <option value="large-battle">Large Battle Vinyl (12-inch Turntable)</option>
                    <option value="compact">Compact Producer Jog (Minimalist)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Orientasi Waveform
                  </label>
                  <select
                    value={waveformOrient}
                    onChange={(e) => setWaveformOrient(e.target.value as WaveformOrientation)}
                    className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:outline-none"
                  >
                    <option value="horizontal">Horizontal (Waveform Bergulir Kiri-Kanan)</option>
                    <option value="vertical">Vertical (Waveform Bergulir Atas-Bawah Battle)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Posisi Waveform Utama
                  </label>
                  <select
                    value={waveformPos}
                    onChange={(e) => setWaveformPos(e.target.value as WaveformPosition)}
                    className="w-full rounded border border-line bg-deck-900 px-3 py-1.5 text-xs text-ink focus:outline-none"
                  >
                    <option value="top-stacked">Top-Stacked (Waveform Bertumpuk di Header)</option>
                    <option value="deck-integrated">Deck-Integrated (Menyatu dalam Deck)</option>
                    <option value="bottom">Bottom (Di atas Panel Bawah)</option>
                    <option value="hidden">Hidden (Sembunyikan Waveform)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPhaseStrip}
                    onChange={(e) => setShowPhaseStrip(e.target.checked)}
                    className="rounded border-line bg-deck-900 text-cyan-500 focus:ring-0"
                  />
                  <span>Tampilkan Bilah Sinkronisasi Fase (Phase Sync Strip) di Bawah</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showScratchPads}
                    onChange={(e) => setShowScratchPads(e.target.checked)}
                    className="rounded border-line bg-deck-900 text-cyan-500 focus:ring-0"
                  />
                  <span>Tampilkan Tombol Cepat Scratch / Turntablist Pads</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-line/40">
                <button
                  type="button"
                  onClick={() => setActiveTab("gallery")}
                  className="rounded border border-line bg-deck-900 px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditor}
                  disabled={isLoading}
                  className="rounded border border-emerald-500/50 bg-emerald-500/20 px-5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                >
                  Simpan & Terapkan Skin Kustom
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
