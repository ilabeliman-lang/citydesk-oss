import { lazy, Suspense, useEffect, useState } from "react";
import { assistantEnabled } from "./flag";

/**
 * NDU-AI avatar-bot assistant: the only eager piece. Renders nothing unless the flag is on, and loads
 * the bot (UI, router, moderation, voice) in its own chunk once the browser is idle after the map paints.
 */
const Bot = lazy(() => import("./AssistantBot"));

export function AssistantSlot() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!assistantEnabled()) return;
    const w = window as Window & {
      requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setOn(true), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setOn(true), 1500);
    return () => window.clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <Bot />
    </Suspense>
  );
}
