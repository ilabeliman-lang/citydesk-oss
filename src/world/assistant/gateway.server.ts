/**
 * NDU-AI avatar-bot assistant: server-side proxy to the studio's existing LitServe gateway. OFF unless
 * ASSISTANT_GATEWAY=on AND ASSISTANT_MODEL names a self-hosted, commercially licensed model (policy.ts).
 * The browser never sees the gateway URL or any key. Every request is rate-limited, moderated in and out,
 * and any tool the model asks for must pass the allowlist. Optional ASSISTANT_GUARD_MODEL
 * (llama-guard3 / shieldgemma) adds a model moderation pass on top of the rules gate.
 */
import { env } from "@/lib/env.server";
import { moderate, REFUSAL, sanitize } from "./moderate.ts";
import { checkModel } from "./policy.ts";
import { createLimiter, DEFAULT_LIMITS } from "./ratelimit.ts";
import { gateModelReply, SYSTEM_PROMPT, type GatedReply } from "./reply.ts";

const limiter = createLimiter(DEFAULT_LIMITS);
const TIMEOUT_MS = 12_000;

export function gatewayConfig() {
  const model = env("ASSISTANT_MODEL");
  const guard = env("ASSISTANT_GUARD_MODEL");
  const modelOk = checkModel(model, "chat");
  const guardOk = guard ? checkModel(guard, "guard") : null;
  return {
    enabled: env("ASSISTANT_GATEWAY") === "on" && modelOk.ok,
    url: (env("ASSISTANT_GATEWAY_URL") ?? "http://127.0.0.1:8860").replace(/\/+$/, ""),
    model: modelOk.ok ? model! : null,
    guard: guardOk && guardOk.ok ? guard! : null,
  };
}

async function complete(
  url: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: 200, temperature: 0.2 }),
      signal: ctl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`gateway ${res.status}`);
    // The gateway always streams OpenAI-style SSE; collect the content deltas (capped).
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; message?: { content?: string } }[];
          };
          out += j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? "";
        } catch {
          // ignore keep-alives
        }
      }
      if (out.length > 2000) {
        await reader.cancel();
        break;
      }
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function guardSays(url: string, guard: string, text: string): Promise<boolean> {
  try {
    const out = await complete(url, guard, [{ role: "user", content: text }]);
    return !/\bunsafe\b/i.test(out);
  } catch {
    return false; // fail closed
  }
}

export type ProxyResult = {
  status: number;
  body: GatedReply | { error: string; retryAfterS?: number };
};

export async function proxyAssistant(clientKey: string, input: unknown): Promise<ProxyResult> {
  const cfg = gatewayConfig();
  if (!cfg.enabled || !cfg.model) return { status: 404, body: { error: "gateway-off" } };
  const text = sanitize((input as { text?: unknown })?.text, 300);
  if (!text) return { status: 400, body: { error: "empty" } };
  const limit = limiter.check(clientKey);
  if (!limit.ok)
    return { status: 429, body: { error: "rate-limited", retryAfterS: limit.retryAfterS } };
  if (moderate(text).verdict === "block")
    return { status: 200, body: { say: REFUSAL, tool: null, confirm: false, blocked: true } };
  if (cfg.guard && !(await guardSays(cfg.url, cfg.guard, text)))
    return { status: 200, body: { say: REFUSAL, tool: null, confirm: false, blocked: true } };
  try {
    const raw = await complete(cfg.url, cfg.model, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ]);
    const reply = gateModelReply(raw);
    if (cfg.guard && !reply.blocked && !(await guardSays(cfg.url, cfg.guard, reply.say)))
      return { status: 200, body: { say: REFUSAL, tool: null, confirm: false, blocked: true } };
    return { status: 200, body: reply };
  } catch {
    return { status: 502, body: { error: "gateway-unavailable" } };
  }
}
