import type { BoothSettings, CaptionMode, CaricaturePreset, PrinterAdapterKind } from "../app/Settings";
import { FRAME_KEYS, type FrameKey } from "../effects/Frames";
import { CAPTIONS, type OverlayKey } from "../effects/HalloweenEffects";
import { OVERLAY_KEYS } from "../effects/Overlays";
import { PRINT_LAYOUTS, PRINT_LAYOUT_LABELS, type PrintLayout } from "../printing/PrintLayout";

interface OperatorPanelProps {
  settings: BoothSettings;
  onChange: (patch: Partial<BoothSettings>) => void;
  onReset: () => void;
  onClose: () => void;
  onTestCamera: () => void;
  onTestCapture: () => void;
  onTestEffect: () => void;
  onTestPrinter: () => void;
  onDiscoverPrinter: () => void;
  onClearPrintQueue: () => void;
  onClearTempPhotos: () => void;
  debugInfo?: { fps?: number; resolution?: string };
}

const PRESETS: CaricaturePreset[] = [
  "Goblin",
  "Demon",
  "HotMess",
  "Witch",
  "Vampire",
  "PumpkinHead",
  "CartoonVillain",
  "DrunkUncle",
  "EvilPromQueen",
  "Random",
];

const CAPTION_MODES: CaptionMode[] = ["off", "random", "fixed"];

const PRINTER_ADAPTERS: { value: PrinterAdapterKind; label: string }[] = [
  { value: "mock", label: "Mock (testing, no hardware)" },
  { value: "shareSheet", label: "Share Sheet (Kodak Photo Printer app, AirDrop, etc.)" },
  { value: "browserPrint", label: "Browser/System Print Dialog" },
  { value: "airPrint", label: "AirPrint (via system print dialog)" },
];

const OVERLAY_LABELS: Record<OverlayKey, string> = {
  bloodSplatter: "Blood Splatter",
  cobwebs: "Cobwebs",
  spiders: "Spiders",
  bats: "Bats",
  skulls: "Skulls",
  eyeballs: "Eyeballs",
  horns: "Horns",
  vampireFangs: "Vampire Fangs",
  graveyard: "Graveyard",
  moon: "Moon",
  candles: "Candles",
  fog: "Fog",
  crackedGlass: "Cracked Glass",
  scratches: "Scratches",
  filmGrain: "Film Grain",
  vignette: "Vignette",
};

function toggleOverlay(current: OverlayKey[], key: OverlayKey, checked: boolean): OverlayKey[] {
  return checked ? [...current, key] : current.filter((k) => k !== key);
}

/**
 * Hidden settings + diagnostics panel (CLAUDE.md sections 47-48). Reached
 * via a 5-second hold on the booth logo; never shown to guests otherwise.
 */
export function OperatorPanel({
  settings,
  onChange,
  onReset,
  onClose,
  onTestCamera,
  onTestCapture,
  onTestEffect,
  onTestPrinter,
  onDiscoverPrinter,
  onClearPrintQueue,
  onClearTempPhotos,
  debugInfo,
}: OperatorPanelProps) {
  return (
    <div className="operator-panel">
      <div className="operator-panel-header">
        <h2>OPERATOR SETTINGS</h2>
        <button className="operator-close" onClick={onClose} aria-label="Close operator panel">
          ×
        </button>
      </div>

      <div className="operator-panel-body">
        <section>
          <h3>Flow</h3>
          <label>
            Countdown seconds
            <input
              type="number"
              min={1}
              max={10}
              value={settings.countdownSeconds}
              onChange={(e) => onChange({ countdownSeconds: Number(e.target.value) })}
            />
          </label>
          <label>
            Auto Start
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={(e) => onChange({ autoStart: e.target.checked })}
            />
          </label>
          <label>
            Idle timeout (seconds)
            <input
              type="number"
              min={10}
              max={300}
              value={settings.idleTimeoutSeconds}
              onChange={(e) => onChange({ idleTimeoutSeconds: Number(e.target.value) })}
            />
          </label>
          <label>
            Attract Mode
            <input
              type="checkbox"
              checked={settings.attractModeEnabled}
              onChange={(e) => onChange({ attractModeEnabled: e.target.checked })}
            />
          </label>
        </section>

        <section>
          <h3>Effects</h3>
          <label>
            Caricature Strength
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.caricatureStrength}
              onChange={(e) => onChange({ caricatureStrength: Number(e.target.value) })}
            />
          </label>
          <label>
            Ghost Strength
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.ghostStrength}
              onChange={(e) => onChange({ ghostStrength: Number(e.target.value) })}
            />
          </label>
          <label>
            Preset
            <select value={settings.preset} onChange={(e) => onChange({ preset: e.target.value as CaricaturePreset })}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frame
            <select value={settings.frame} onChange={(e) => onChange({ frame: e.target.value as FrameKey })}>
              {FRAME_KEYS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="operator-overlay-fieldset">
            <legend>Overlays (Halloween decorations, drawn on top of every photo)</legend>
            <div className="operator-overlay-grid">
              {OVERLAY_KEYS.map((key) => (
                <label key={key} className="operator-overlay-option">
                  <input
                    type="checkbox"
                    checked={settings.overlays.includes(key)}
                    onChange={(e) => onChange({ overlays: toggleOverlay(settings.overlays, key, e.target.checked) })}
                  />
                  {OVERLAY_LABELS[key]}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Caption Mode
            <select
              value={settings.captionMode}
              onChange={(e) => onChange({ captionMode: e.target.value as CaptionMode })}
            >
              {CAPTION_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {settings.captionMode === "fixed" && (
            <label>
              Fixed Caption
              <select value={settings.fixedCaption} onChange={(e) => onChange({ fixedCaption: e.target.value })}>
                {CAPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            My Cameo (beta)
            <input
              type="checkbox"
              checked={settings.ownerCameoMode === "always"}
              onChange={(e) => onChange({ ownerCameoMode: e.target.checked ? "always" : "off" })}
            />
          </label>
          <label>
            Poster Mode (beta)
            <input
              type="checkbox"
              checked={settings.posterMode}
              onChange={(e) => onChange({ posterMode: e.target.checked })}
            />
          </label>
        </section>

        <section>
          <h3>Printing</h3>
          <label>
            Printer
            <select
              value={settings.printerAdapter}
              onChange={(e) => onChange({ printerAdapter: e.target.value as PrinterAdapterKind })}
            >
              {PRINTER_ADAPTERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Auto Print
            <input
              type="checkbox"
              checked={settings.autoPrint}
              onChange={(e) => onChange({ autoPrint: e.target.checked })}
            />
          </label>
          <label>
            Copies
            <input
              type="number"
              min={1}
              max={5}
              value={settings.copies}
              onChange={(e) => onChange({ copies: Number(e.target.value) })}
            />
          </label>
          <label>
            Print Layout
            <select
              value={settings.printLayout}
              onChange={(e) => onChange({ printLayout: e.target.value as PrintLayout })}
            >
              {PRINT_LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {PRINT_LAYOUT_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h3>Misc</h3>
          <label>
            Sound Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.soundVolume}
              onChange={(e) => onChange({ soundVolume: Number(e.target.value) })}
            />
          </label>
          <label>
            Photo Retention (minutes)
            <input
              type="number"
              min={1}
              max={1440}
              value={settings.photoRetentionMinutes}
              onChange={(e) => onChange({ photoRetentionMinutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Debug Mode
            <input
              type="checkbox"
              checked={settings.debugMode}
              onChange={(e) => onChange({ debugMode: e.target.checked })}
            />
          </label>
        </section>

        <section>
          <h3>Operator Tools</h3>
          <div className="operator-tool-grid">
            <button onClick={onTestCamera}>TEST CAMERA</button>
            <button onClick={onTestCapture}>TEST CAPTURE</button>
            <button onClick={onTestEffect}>TEST EFFECT</button>
            <button onClick={onTestPrinter}>TEST PRINTER</button>
            <button onClick={onDiscoverPrinter}>DISCOVER PRINTER</button>
            <button onClick={onClearPrintQueue}>CLEAR PRINT QUEUE</button>
            <button onClick={onClearTempPhotos}>CLEAR TEMP PHOTOS</button>
            <button onClick={onReset}>RESET SETTINGS</button>
          </div>
          {debugInfo && (
            <p className="operator-debug-info">
              {debugInfo.fps !== undefined && `FPS: ${debugInfo.fps} `}
              {debugInfo.resolution && `Resolution: ${debugInfo.resolution}`}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
