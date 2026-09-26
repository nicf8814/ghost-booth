import { useEffect, useState } from "react";

interface CountdownProps {
  seconds: number;
  onComplete: () => void;
}

/**
 * Big-number countdown (CLAUDE.md section 35): 3, 2, 1, BOO! then fires
 * onComplete so the state machine can move into "capturing".
 */
export function Countdown({ seconds, onComplete }: CountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [showBoo, setShowBoo] = useState(false);

  useEffect(() => {
    if (remaining <= 0) {
      setShowBoo(true);
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onComplete]);

  return (
    <div className="screen countdown-screen">
      <div className="countdown-number" key={showBoo ? "boo" : remaining}>
        {showBoo ? "BOO!" : remaining}
      </div>
    </div>
  );
}
