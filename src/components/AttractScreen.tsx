import { useEffect, useState } from "react";
import { ATTRACT_MESSAGES } from "../effects/HalloweenEffects";

interface AttractScreenProps {
  onStart: () => void;
}

const ROTATE_MS = 3500;

/**
 * Full-screen idle screen (CLAUDE.md sections 32-33). Rotates through
 * spooky taglines and waits for a tap (or auto-detection upstream) to
 * begin the booth flow.
 */
export function AttractScreen({ onStart }: AttractScreenProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % ATTRACT_MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="screen attract-screen" onClick={onStart}>
      <div className="attract-glow" />
      <h1 className="attract-title" key={index}>
        {ATTRACT_MESSAGES[index]}
      </h1>
      <button className="big-button pulse" onClick={onStart}>
        TAP TO BEGIN
      </button>
    </div>
  );
}
