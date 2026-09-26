import { useRef, type ReactNode } from "react";

interface HoldToActivateProps {
  holdMs?: number;
  onActivate: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * CLAUDE.md section 47: operator settings are reached by pressing and
 * holding the booth logo for 5 seconds (configurable), so guests never
 * stumble into it with a normal tap.
 */
export function HoldToActivate({ holdMs = 5000, onActivate, children, className }: HoldToActivateProps) {
  const timerRef = useRef<number | null>(null);

  const start = () => {
    timerRef.current = window.setTimeout(onActivate, holdMs);
  };

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div
      className={className}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      {children}
    </div>
  );
}
