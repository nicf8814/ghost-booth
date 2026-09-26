interface ResultScreenProps {
  imageUrl: string | null;
  onPrint: () => void;
  onRetake: () => void;
}

/**
 * CLAUDE.md section 36. In this phase there's no real effects pipeline
 * yet, so imageUrl is the plain captured photo — the composition engine
 * slots in here once Phases 3-8 land, without this screen changing.
 */
export function ResultScreen({ imageUrl, onPrint, onRetake }: ResultScreenProps) {
  return (
    <div className="screen result-screen">
      <div className="result-photo-frame">
        {imageUrl ? (
          <img src={imageUrl} alt="Your haunted photo" className="result-photo" />
        ) : (
          <div className="result-photo-placeholder">NO PHOTO</div>
        )}
      </div>
      <div className="result-controls">
        <button className="big-button" onClick={onPrint}>
          PRINT
        </button>
        <button className="big-button secondary" onClick={onRetake}>
          RETAKE
        </button>
      </div>
    </div>
  );
}
