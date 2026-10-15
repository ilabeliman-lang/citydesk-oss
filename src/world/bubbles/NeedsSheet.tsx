import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, HeartPulse } from "lucide-react";
import { NEED_KEYS } from "@/game/sim";
import { useSim } from "@/game/useSim";
import { Bubble } from "./Bubble";
import { tapBuzz, useBubbleMode } from "./mode";

/**
 * NDU-UPG bubbles: the big needs/actions card folds into one ring bubble at the bottom corner.
 * The ring fills with the average of the needs; a badge shows 18+ before the age check, or how many
 * needs are running low. Tapping it (or meeting a person on the map) opens the card as a
 * bottom sheet that grows out of the bubble; the handle or the fold button shrinks it back.
 * The card stays mounted while folded so the life clock keeps ticking.
 */
export function NeedsSheet({ openKey, children }: { openKey?: string | null; children: ReactNode }) {
  const bubbles = useBubbleMode();
  const snap = useSim();
  const [open, setOpen] = useState(false);
  const first = useRef(true);

  // Pop the sheet open when something new needs an answer (e.g. a person tapped on the map).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (openKey) setOpen(true);
  }, [openKey]);

  if (!bubbles) return <>{children}</>;

  const playing = snap.phase === "play";
  const values = NEED_KEYS.map((key) => Number(snap.needs[key]) || 0);
  const avg = playing && values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const low = playing ? values.filter((v) => v < 25).length : 0;
  const badge = !playing ? "18+" : low || null;
  const label = !playing ? "Needs: confirm you are 18 to take part" : low ? `Needs: ${low} running low` : "Needs and actions";
  const toggle = (next: boolean) => {
    tapBuzz();
    setOpen(next);
  };

  return (
    <>
      {open ? null : (
        <span className="ndu-needs-bub" data-ndu-bubble-hideable="">
          <Bubble size="lg" label={label} aria-expanded={false} badge={badge} badgeTone={!playing ? "pulse" : "warn"} onClick={() => setOpen(true)}>
            <span className="ndu-ring" style={{ "--p": avg / 100 } as CSSProperties}>
              <span>
                <HeartPulse aria-hidden="true" />
              </span>
            </span>
          </Bubble>
        </span>
      )}
      <div className="ndu-sheet" hidden={!open} role="region" aria-label="Needs and actions">
        <button type="button" className="ndu-sheet__fold" aria-label="Fold into the bubble" onClick={() => toggle(false)} />
        <Bubble size="sm" className="ndu-sheet__close" label="Fold into the bubble" onClick={() => setOpen(false)}>
          <ChevronDown aria-hidden="true" />
        </Bubble>
        {children}
      </div>
    </>
  );
}
