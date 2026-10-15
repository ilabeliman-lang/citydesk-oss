import { lazy, Suspense, useEffect, useState } from "react";
import { immerseAllowed } from "./flag";

/**
 * NDU-UPG immerse: the one small weather + sound bubble, lazy-loaded so the first map stays light.
 * Renders nothing on the server, with `?immerse=0`, or with VITE_NDU_IMMERSE=off (#350).
 */
const Bubble = lazy(() => import("./ImmerseBubble"));

export function ImmerseSlot() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(immerseAllowed()), []);
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <Bubble />
    </Suspense>
  );
}
