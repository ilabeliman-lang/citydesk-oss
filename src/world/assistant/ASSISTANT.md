# NDU-AI: avatar-bot assistant ("Ada")

An embossed, animated guide bot on the map (bottom right, above the needs bubble). Tap it to open its
speech-bubble card. Lazy-loaded after the first map paint (`AssistantBot` chunk, about 10 kB gzip); the
eager cost is `AssistantSlot` + `bridgeStore` + `flag` (a few hundred bytes).

## Flag

- Dev (`vite dev`): ON. `?assistant=0` hides it.
- Production builds: OFF unless the build env sets `VITE_NDU_ASSISTANT=on` (Wei's switch).

## What it can do (strict allowlist, `tools.ts`)

| tool           | what it does                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `fly_to`       | fly the camera to a remembered place, a nearby place, or a named thing on screen; "go home" returns to the player |
| `find_place`   | find a building/shop/property by name among what's drawn + the nearby places list, then fly to it                 |
| `explain_view` | describe the building, POI and street in the middle of the screen, plus weather                                   |
| `toggle_layer` | show/hide `buildings`, `labels`, `route`, `effects`                                                               |
| `set_weather`  | preview `clear/cloudy/rain/storm/fog/haze` or go back to `live` (immerse store)                                   |
| `start_scan`   | open the scan panel, only after the player taps "Yes, open scans"; nothing is uploaded by the bot                 |

No other tool exists. Names or arguments matching wallet, mint, payment, transfer, claim, purchase,
seed/private key, GreenFunds or TradeForge are refused (`FORBIDDEN`). The executor imports no wallet,
mint, payment, property-claim or GreenFunds module.

## Moderation (`moderate.ts`, `plan.ts`)

Every input line and every output line goes through a rules + keyword gate (adult, minor safety,
money/scam, secrets, jailbreak, harm) with l33t/spacing/zero-width normalisation. Blocked input is never
routed, remembered or sent. Money/wallet/mint/claim requests get an explicit refusal. Model replies (when
the gateway is on) are parsed, moderated and their tool re-checked against the allowlist on the server
AND the client. Optional `ASSISTANT_GUARD_MODEL` (llama-guard3 / shieldgemma) adds a model pass.

## Memory (`memory.ts`)

localStorage only (`ndu.assistant.mem.v1`): up to 8 recent places, nickname, voice on/off, last weather
preview. PII is redacted and moderated text is dropped before storing. "Forget me" (trash button or
saying "forget me") deletes the key. No DB, no migration, nothing sent to the server.

## Voice (`speech.ts`)

Browser SpeechSynthesis, sentence by sentence. Muted by default on first load. No Kokoro/Piper path:
the studio gateway serves no TTS model.

## Gateway proxy (`/api/assistant`, `gateway.server.ts`) — OFF by default

Lines the local router can't place go to the server proxy only when ALL of these are set on the server:
`ASSISTANT_GATEWAY=on`, `ASSISTANT_MODEL=<self-hosted model>`, optional `ASSISTANT_GATEWAY_URL`
(default `http://127.0.0.1:8860`, the studio LitServe gateway). `policy.ts` only accepts `ollama/` or
`gpu/` models (no paid hosted `lightning/*`), from commercially licensed families, never abliterated or
uncensored builds. Rate limits: 8/min and 120/day per client IP, 600/hour global (in-process).

Gateway as found on Oct 8 2026: `/v1/chat/completions` (streams, forwards `messages` only, no native
tool calling) and `/v1/models`. Models: paid hosted `lightning/*` (OpenAI, Anthropic, Google, Gemma-4-31B,
Qwen3.8-27B, GLM, DeepSeek...) and one local `ollama/huihui_ai/qwen2.5-coder-abliterate:3b`, which is
refused (abliterated = safety removed; Qwen2.5 3B is under the non-commercial Qwen Research licence).
So the assistant ships on the deterministic local router. To turn the model path on, serve e.g.
`ollama/qwen2.5:7b-instruct` (Apache-2.0) or `ollama/llama3.1:8b` (Llama 3.1 Community licence), plus
`ollama/llama-guard3:1b` as the guard, on the existing ollama.

## Tests

`npm run test:assistant` (also a blocking step in CI): allowlist, moderation gate, intent router, memory,
model policy, rate limits, persona moods.
