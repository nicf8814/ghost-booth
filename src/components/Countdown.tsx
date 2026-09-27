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
  // Derived from `remaining` rather than a second piece of state set inside
  // the effect below -- the earlier version called setShowBoo(true)
  // synchronously inside the effect body once remaining hit 0, which
  // triggers an extra render for no reason (oxlint's
  // react(set-state-in-effect) rule flags exactly this). Deriving it during
  // render instead means there's only ever one state transition per tick.
  const showBoo = remaining <= 0;

  useEffect(() => {
    if (showBoo) {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, showBoo, onComplete]);

  return (
    <div className="screen countdown-screen">
      <div className="countdown-number" key={showBoo ? "boo" : remaining}>
        {showBoo ? "BOO!" : remaining}
      </div>
    </div>
  );
}
