import { PRINT_FAILURE_MESSAGE } from "../effects/HalloweenEffects";

interface PrintingScreenProps {
  status: "printing" | "success" | "failed";
  onRetry: () => void;
  onSavePhoto: () => void;
  onContinueWithoutPrinting: () => void;
}

/**
 * CLAUDE.md sections 36, 39. On failure, the finished image is never
 * discarded — the operator/guest can retry, save, or move on.
 */
export function PrintingScreen({
  status,
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
        <p className="processing-message">YOUR PHOTO HAS BEEN CONJURED.</p>
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
