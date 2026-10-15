/**
 * NDU-AI avatar-bot assistant: parse a gateway model's reply into { say, tool } and run it through the
 * allowlist + moderation gate. Pure (shared by the server proxy and tests).
 */
import { moderate, REFUSAL, sanitize } from "./moderate.ts";
import { checkToolCall, TOOL_SPECS, type ToolCall } from "./tools.ts";

export type GatedReply = { say: string; tool: ToolCall | null; confirm: boolean; blocked: boolean };

export const SYSTEM_PROMPT = [
  "You are Ada, a friendly guide bot inside NDU CityDesk, a 3D city map. Audience: general, keep it family-safe.",
  "You can only use these tools (JSON function list follows). You never handle money, wallets, minting, payments, claims or investment products, and you refuse those topics.",
  "Answer in at most two short sentences.",
  'Reply with ONE JSON object only: {"say": "<text for the player>", "tool": null | {"name": "<tool>", "args": {...}}}.',
  "Tools: " +
    JSON.stringify(
      TOOL_SPECS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    ),
].join("\n");

function firstJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function gateModelReply(text: string): GatedReply {
  const parsed = firstJson(text) as { say?: unknown; tool?: unknown } | null;
  const say = sanitize(parsed ? parsed.say : text, 400);
  if (moderate(say).verdict === "block")
    return { say: REFUSAL, tool: null, confirm: false, blocked: true };
  let tool: ToolCall | null = null;
  let confirm = false;
  if (parsed && parsed.tool) {
    const check = checkToolCall(parsed.tool);
    if (check.ok) {
      tool = check.call;
      confirm = check.confirm;
    }
  }
  return {
    say: say || (tool ? "On it." : "Sorry, I didn't get that."),
    tool,
    confirm,
    blocked: false,
  };
}
