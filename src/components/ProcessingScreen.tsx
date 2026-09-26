import { useEffect, useState } from "react";
import { PROCESSING_MESSAGES } from "../effects/HalloweenEffects";

const MESSAGE_ROTATE_MS = 900;

/**
 * CLAUDE.md section 26: never show a blank loading screen — rotate
 * through absurd status messages while the (stubbed, for now) vision +
 * effects pipeline runs.
 */
export function ProcessingScreen() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % PROCESSING_MESSAGES.length);
    }, MESSAGE_ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="screen processing-screen">
      <div className="spinner" />
      <p className="processing-message" key={index}>
        {PROCESSING_MESSAGES[index]}
      </p>
    </div>
  );
}
