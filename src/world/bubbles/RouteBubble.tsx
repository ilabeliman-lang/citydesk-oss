import { useState, type CSSProperties, type ReactNode } from "react";
import { Navigation } from "lucide-react";
import { useBubbleMode, tapBuzz } from "./mode";
import "./bubbles.css";

/**
 * NDU-UPG bubbles: the route card becomes a small pill with a progress ring and the arrival time.
 * Tap it for the full card (distance, source, Stop); tap again to fold it.
 */
export function RouteBubble({ eta, progress, children }: { eta: string; progress: number; children: ReactNode }) {
  const bubbles = useBubbleMode();
  const [open, setOpen] = useState(false);
  if (!bubbles) return <>{children}</>;
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return (
    <div className="ndu-route" data-ndu-bubble-hideable="">
      <button
        type="button"
        className="ndu-route__pill"
        aria-expanded={open}
        aria-label={`Route, arriving ${eta}, ${Math.round(p * 100)}% there. ${open ? "Fold" : "Show"} the route card`}
        onClick={() => {
          tapBuzz();
          setOpen((v) => !v);
        }}
      >
        <span className="ndu-ring" style={{ "--p": p } as CSSProperties}>
          <span>
            <Navigation aria-hidden="true" />
          </span>
        </span>
        {eta}
      </button>
      <div className="ndu-unfold w-full" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
