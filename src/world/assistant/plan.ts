/**
 * NDU-AI avatar-bot assistant: one typed line -> one plan. Moderation runs FIRST (nothing blocked is
 * routed, remembered or sent anywhere), then the local intent router, then the tool allowlist.
 * Pure, so the whole input path is covered by node tests.
 */
import { routeIntent } from "./intent.ts";
import { moderate, REFUSAL, sanitize } from "./moderate.ts";
import { checkToolCall, FORBIDDEN, type ToolCall } from "./tools.ts";

export type Plan =
  | { type: "blocked"; say: string; category: string }
  | { type: "say"; say: string }
  | { type: "tool"; call: ToolCall; confirm: boolean }
  | { type: "forget" }
  | { type: "list" }
  | { type: "nickname"; value: string }
  | { type: "voice"; on: boolean }
  /** The local router has no match: ask the gateway if it's on, otherwise show the fallback. */
  | { type: "fallback"; text: string };

export const NO_MONEY =
  "I can't do wallet, minting, payment, purchase or claim actions, and I never will. Use the app's own screens for those. I can fly the map, find places, explain the view, change the weather or open scans.";

export const FALLBACK =
  "I didn't catch that. Try “fly to …”, “find …”, “what am I looking at?”, “make it rain”, “hide labels” or “start a scan”.";

export function planLine(input: string): Plan {
  const text = sanitize(input, 300);
  const mod = moderate(text);
  if (mod.verdict === "block") return { type: "blocked", say: REFUSAL, category: mod.category };
  if (FORBIDDEN.test(text)) return { type: "blocked", say: NO_MONEY, category: "money-action" };
  const r = routeIntent(text);
  switch (r.kind) {
    case "tool": {
      const check = checkToolCall(r.call);
      if (!check.ok) return { type: "blocked", say: REFUSAL, category: "tool" };
      return { type: "tool", call: check.call, confirm: check.confirm };
    }
    case "memory":
      return r.action === "forget" ? { type: "forget" } : { type: "list" };
    case "nickname":
      return { type: "nickname", value: r.value };
    case "voice":
      return { type: "voice", on: r.on };
    case "say":
      return { type: "say", say: r.text };
    case "unknown":
      return { type: "fallback", text };
  }
}

/** Gate every line the bot is about to show or speak. */
export function gateOut(text: string): string {
  const s = sanitize(text, 600);
  return moderate(s).verdict === "block" ? REFUSAL : s;
}
