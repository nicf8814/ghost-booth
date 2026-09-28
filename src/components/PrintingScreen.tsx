import { PRINT_FAILURE_MESSAGE } from "../effects/HalloweenEffects";
import type { PrinterAdapterKind } from "../app/Settings";

interface PrintingScreenProps {
  status: "printing" | "success" | "failed";
  printerAdapter: PrinterAdapterKind;
  onRetry: () => void;
  onSavePhoto: () => void;
  onContinueWithoutPrinting: () => void;
}

/**
 * CLAUDE.md sections 36, 39. On failure, the finished image is never
 * discarded — the operator/guest can retry, save, or move on.
 *
 * The "success" message depends on which adapter actually ran: the Kodak
 * Mini 2 Retro's own app isn't a registered iOS share extension and can't
 * be picked directly from the share sheet (confirmed on the real device --
 * see ShareSheetPrinterAdapter.ts and PROJECT_LOG.md), so "success" there
 * only means the photo made it into Photos, not that a print actually
 * came out. Saying "conjured"/printed at that point would be wrong and
 * would send the operator looking for a print that isn't coming without
 * one more manual step on their part.
 */
export function PrintingScreen({
  status,
  printerAdapter,
  onRetry,
  onSavePhoto,
  onContinueWithoutPrinting,
}: PrintingScreenProps) {
  if (status === "printing") {
    return (
      <div className="screen printing-screen">
        <div className="spinner" />
        <p className="processing-message">SUMMONING THE PRINTER...</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="screen printing-screen">
        {printerAdapter === "shareSheet" ? (
          <>
            <p className="processing-message">PHOTO SAVED TO YOUR PHOTOS.</p>
            <p className="processing-submessage">Open the Kodak Photo Printer app to print it from there.</p>
          </>
        ) : (
          <p className="processing-message">YOUR PHOTO HAS BEEN CONJURED.</p>
        )}
      </div>
    );
  }

  return (
    <div className="screen printing-screen error">
      <h2>{PRINT_FAILURE_MESSAGE}</h2>
      <div className="result-controls">
        <button className="big-button" onClick={onRetry}>
          TRY AGAIN
        </button>
        <button className="big-button secondary" onClick={onSavePhoto}>
          SAVE PHOTO
        </button>
        <button className="big-button secondary" onClick={onContinueWithoutPrinting}>
          CONTINUE WITHOUT PRINTING
        </button>
      </div>
    </div>
  );
}
