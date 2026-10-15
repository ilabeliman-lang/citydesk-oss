/**
 * NDU-AI avatar-bot assistant: which gateway models the server proxy may call. Self-hosted only
 * (`ollama/` or `gpu/` on the existing LitServe gateway = no paid API spend), commercially licensed
 * families only, and never an "abliterated"/uncensored build. The `lightning/*` hosted models on the
 * gateway are paid per token, so they are refused here by design.
 */
const PREFIXES = ["ollama/", "gpu/"];
const BANNED = /(abliterat|uncensor|nsfw|lewd|dolphin|jailbreak|unfiltered|rp-|roleplay)/i;

/** Family -> licence note. Only families with a licence that allows commercial use. */
export const LICENCES: { re: RegExp; licence: string; role: "chat" | "guard" }[] = [
  // Qwen2.5 Instruct 0.5B/1.5B/7B/14B/32B are Apache-2.0 (3B and 72B are NOT: Qwen Research / Qwen licence).
  {
    re: /^qwen2\.5(?:-instruct)?:(?:0\.5b|1\.5b|7b|14b|32b)(?:-instruct)?(?:-q\w+)?$/i,
    licence: "Apache-2.0",
    role: "chat",
  },
  {
    re: /^llama3\.[12]:(?:1b|3b|8b)(?:-instruct)?(?:-q\w+)?$/i,
    licence: "Llama 3.1/3.2 Community (commercial OK, AUP)",
    role: "chat",
  },
  { re: /^mistral:7b(?:-instruct)?(?:-q\w+)?$/i, licence: "Apache-2.0", role: "chat" },
  { re: /^phi(?:3|3\.5|4)(?:-mini)?(?::[\w.-]+)?$/i, licence: "MIT", role: "chat" },
  {
    re: /^gemma(?:2|3):(?:1b|2b|4b|9b|12b)(?:-it)?(?:-q\w+)?$/i,
    licence: "Gemma Terms of Use (commercial OK, use policy)",
    role: "chat",
  },
  {
    re: /^llama-guard3:(?:1b|8b)$/i,
    licence: "Llama 3.1/3.2 Community (commercial OK, AUP)",
    role: "guard",
  },
  {
    re: /^shieldgemma:(?:2b|9b|27b)$/i,
    licence: "Gemma Terms of Use (commercial OK, use policy)",
    role: "guard",
  },
];

export type ModelCheck =
  { ok: true; licence: string; role: "chat" | "guard" } | { ok: false; reason: string };

export function checkModel(id: unknown, role: "chat" | "guard" = "chat"): ModelCheck {
  if (typeof id !== "string" || !id.trim()) return { ok: false, reason: "no model configured" };
  const prefix = PREFIXES.find((p) => id.startsWith(p));
  if (!prefix)
    return {
      ok: false,
      reason:
        "only self-hosted gateway models (ollama/, gpu/) are allowed; hosted models cost money",
    };
  if (BANNED.test(id))
    return { ok: false, reason: "uncensored/abliterated models are not allowed" };
  const name = id.slice(prefix.length);
  const hit = LICENCES.find((l) => l.re.test(name));
  if (!hit) return { ok: false, reason: "model family is not on the commercial-licence allowlist" };
  if (hit.role !== role) return { ok: false, reason: `model is a ${hit.role} model, not ${role}` };
  return { ok: true, licence: hit.licence, role: hit.role };
}
