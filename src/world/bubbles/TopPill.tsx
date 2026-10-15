import { useEffect, useRef, useState } from "react";
import { Ellipsis, Eye, EyeOff, Home, LayoutList, MonitorSmartphone, Phone, Radar, Search, Shield } from "lucide-react";
import { openSessionsSheet } from "@/lib/auth/sessions/open-store"; // NDU-UPG sessions
import { SessionsSheetLazy } from "@/lib/auth/sessions/SessionsSheetLazy"; // NDU-UPG sessions
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { BagButton } from "@/world/bag";
import { Bubble } from "./Bubble";
import { setClearMap, setUiMode, tapBuzz, useClearMap } from "./mode";
import { SearchBubble } from "@/world/search/SearchBubble"; // NDU-AI search
import { useSearchOn } from "@/world/search/useSearchOn"; // NDU-AI search
import type { Place } from "@/world/places";

/**
 * NDU-UPG bubbles: the old full-width top bar folded into one small pill —
 * brand · magnifier (opens the "tap a street" hint) · phone (nearby count) · bag (item count) · more.
 * "More" holds the visible-to-neighbours switch, the account, full-map and classic-cards.
 */
export function TopPill({
  nearby,
  onPhone,
  visible,
  onVisible,
  places,
}: {
  places?: Place[]; // NDU-AI search: the map's places are searchable without another Overpass call
  nearby: number;
  onPhone: () => void;
  visible: boolean;
  onVisible: () => void;
}) {
  const [hint, setHint] = useState(false);
  const [menu, setMenu] = useState(false);
  const clear = useClearMap();
  const search = useSearchOn(); // NDU-AI search
  const box = useRef<HTMLDivElement>(null);

  // The hint folds itself away after a few seconds.
  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(false), 7000);
    return () => window.clearTimeout(id);
  }, [hint]);

  // A tap anywhere else folds the pill back.
  useEffect(() => {
    if (!hint && !menu) return;
    const onDown = (event: PointerEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      setHint(false);
      setMenu(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, [hint, menu]);

  return (
    <div ref={box} className="ndu-top" aria-label="Ndu">
      <span className="ndu-top__brand">Ndu</span>
      {/* NDU-AI search: the magnifier opens semantic + voice search (flag ?search=0 restores the tip) */}
      {search ? (
        <SearchBubble places={places} />
      ) : (
        <Bubble size="sm" label={hint ? "Hide the tip" : "Where to? How to move"} aria-expanded={hint} onClick={() => setHint((v) => !v)}>
          <Search aria-hidden="true" />
        </Bubble>
      )}
      {hint ? (
        <p className="ndu-top__hint" role="status">
          Tap a street to go there. Drag sideways to turn, up or down to slide.{nearby ? ` · ${nearby} nearby` : ""}
        </p>
      ) : null}
      <Bubble size="sm" label={nearby ? `Phone, ${nearby} nearby` : "Phone"} badge={nearby} onClick={onPhone}>
        <Phone aria-hidden="true" />
      </Bubble>
      <BagButton bubble />
      {clear ? (
        <Bubble size="sm" label="Show the bubbles again" aria-pressed={true} onClick={() => setClearMap(false)}>
          <EyeOff aria-hidden="true" />
        </Bubble>
      ) : null}
      <div className="relative">
        <Bubble size="sm" label={menu ? "Close the menu" : "More"} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)}>
          <Ellipsis aria-hidden="true" />
        </Bubble>
        {menu ? (
          <div className="ndu-menu" role="menu">
            <SignedIn>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                className="ndu-menu__row"
                onClick={() => {
                  tapBuzz();
                  onVisible();
                }}
              >
                <span className="ndu-bub ndu-bub--sm" aria-pressed={visible}>
                  <Radar aria-hidden="true" />
                </span>
                {visible ? "Visible to people nearby" : "Hidden from people nearby"}
              </button>
              <div className="ndu-menu__row">
                <UserButton />
              </div>
              {/* NDU-UPG sessions: Account → Sessions */}
              <button
                type="button"
                role="menuitem"
                className="ndu-menu__row"
                onClick={() => {
                  tapBuzz();
                  setMenu(false);
                  openSessionsSheet();
                }}
              >
                <span className="ndu-bub ndu-bub--sm">
                  <MonitorSmartphone aria-hidden="true" />
                </span>
                Sessions and devices
              </button>
            </SignedIn>
            <SignedOut>
              <a
                href="/login"
                role="menuitem"
                className="ndu-menu__row"
                onClick={() => setMenu(false)}
              >
                <span className="ndu-bub ndu-bub--sm">
                  <Shield aria-hidden="true" />
                </span>
                Sign in to Session
              </a>
            </SignedOut>
            <a
              href="/"
              role="menuitem"
              className="ndu-menu__row"
              onClick={() => setMenu(false)}
            >
              <span className="ndu-bub ndu-bub--sm">
                <Home aria-hidden="true" />
              </span>
              CityDesk Landing
            </a>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={clear}
              className="ndu-menu__row"
              onClick={() => {
                tapBuzz();
                setClearMap(!clear);
                setMenu(false);
              }}
            >
              <span className="ndu-bub ndu-bub--sm" aria-pressed={clear}>
                {clear ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </span>
              {clear ? "Show the bubbles" : "Full map (hide bubbles)"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="ndu-menu__row"
              onClick={() => {
                tapBuzz();
                setMenu(false);
                setUiMode("classic");
              }}
            >
              <span className="ndu-bub ndu-bub--sm">
                <LayoutList aria-hidden="true" />
              </span>
              Classic cards
            </button>
          </div>
        ) : null}
      </div>
      <SessionsSheetLazy /> {/* NDU-UPG sessions */}
    </div>
  );
}
