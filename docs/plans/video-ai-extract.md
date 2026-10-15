# Plan: video AI -> standalone FastAPI service

- **Ticket:** heavy-a7 (Batch A, governed by `docs/adr/ADR-engine-extract.md`)
- **Date:** 2026-10-12
- **Acceptance:** Plan only — no code migrated.
- **Gate:** doc exists with file:line evidence; typecheck stays 0; no `src/` changes.

## Naming note (verified, not assumed)

There is **no video-processing pipeline in the codebase today** — grep for
`video|ffmpeg|frame extraction` across `src/` and `agent-office/` finds no
frame/AI inference code (the `frame` hits are HTTP `frame-src` CSP strings).
What *does* exist, and is the real extractable artifact, is the **model-serving
gateway**: a Python **LitServe / FastAPI** service that fronts every model
backend behind one OpenAI-compatible endpoint. A "video AI service" would be a
**new backend registered in that gateway**, not a rewrite of an existing video
module. This plan extracts the gateway as a standalone service and specifies the
video-AI backend as the first new workload on it.

## The service surface today (file:line verified)

`agent-office/gateway/gateway.py` — single file, header: *"LitServe gateway: one
OpenAI-compatible endpoint (127.0.0.1:8860/v1) in front of every office
backend."*

- **The service shell (app-agnostic, extractable):**
  - `:1-8` module docstring — the routing contract and security posture.
  - `env()` + `env()` at ~`:28` — reads `~/.agent-office/env` per request
    (`ENV_PATH` at `:18`, overridable via `AGENT_OFFICE_ENV`); *"keys read from
    ~/.agent-office/env per request (never logged)"*.
  - `resolve(model) -> (base_url, api_key, upstream_model, backend)` at `:38` —
    the backend resolver. Prefix routing:
    - `lightning/` | `openai/`|`anthropic/`|`google/`|`lightning-ai/` →
      Lightning Model APIs (`LIGHTNING_BASE` `:20`), key from
      `LIGHTNING_MODELS_API_KEY`.
    - `ollama/` → local Ollama `http://127.0.0.1:11535/v1`.
    - `gpu/` → GPU Local studio, gated on `GPU_STATE` (`:19`
      `~/.gpu_endpoint.json`): raises *"GPU Local is not running"* (`:53`) unless
      `base_url` + `token` present (`:55`).
    - `inference/` → Lightning Inference endpoint via `INFER_ENDPOINT`, raises
      *"no Inference endpoint deployed"* when unset.
  - `litserve` + `OpenAISpec` (`:11-12`) — the FastAPI-compatible serving layer;
    one OpenAI-shaped surface for all backends.
- **The app coupling (stays in agent-office):**
  - pm2 process `litserve-gateway` (`server.js:42`) — the supervisor registration.
  - `GATEWAY_URL` / `CONSOLE_GATEWAY` (`server.js:47`, `console.js:18`) — how
    the office points at `127.0.0.1:8860`.
  - `sessions.js:597` — the office router that chooses `provider === 'gateway'`
    and sends `prefix/<id>` model strings.

The gateway is already **CPU-only, 127.0.0.1-only** (`:8`) — a clean, narrow
service boundary.

## Service boundary

```
citydesk-model-gateway        (the standalone FastAPI/LitServe service)
  gateway.py                  resolve()/env()/OpenAISpec — moved verbatim
  backends/                   pluggable backend descriptors (lightning|ollama|gpu|inference)
  app.py                      the FastAPI app (LitServe or plain FastAPI)
  config.py                   env loading; NO office paths hard-coded
```

Stays in agent-office: the pm2 registration, the router (`sessions.js:597`), the
console pointer, and `~/.agent-office/env` *contents* (the service reads the path
but the office owns the file).

## FastAPI endpoints it would expose

- `POST /v1/chat/completions` — the OpenAI-compatible passthrough (LitServe
  `OpenAISpec` already provides this shape), routed by the `model` prefix via
  `resolve()`.
- `POST /v1/video/jobs` — **the new video-AI workload**: submit a clip/frames,
  returns a `job_id`. This is the add the ticket is really about.
- `GET /v1/video/jobs/{id}` — poll status (`queued|running|done|failed`) +
  result pointer.
- `GET /v1/models` — enumerate backends (mirror of `resolve()`'s prefixes).
- `GET /healthz` — readiness; reports which backends are live (GPU Local up?
  `GPU_STATE` readable? inference deployed?).

## How model backends config (the gateway's resolve()/env pattern)

The gateway is the **reference pattern** and the extract keeps it exactly:
`resolve(model)` maps a prefix to `(base_url, api_key, upstream_model, backend)`
purely from env + `GPU_STATE`. The standalone service generalises this into a
`backends/` registry so a **video backend** is one more entry:

```python
# backends/video.py — same shape as the gpu/ branch
def resolve_video(model):
    # returns (base_url, token, upstream_model, "video")
    ...
```

Config stays env-first (`AGENT_OFFICE_ENV`-style path override), keys never
logged — the `:8` posture becomes the service's documented security contract.

## Deployment shape (systemd / GPU; the office runs on a GPU box)

- **Today:** pm2 (`server.js:42`), 127.0.0.1:8860, CPU-only.
- **Standalone:** a `systemd` unit (`citydesk-model-gateway.service`) with
  `Restart=always`, `EnvironmentFile=/etc/citydesk/gateway.env`, bound to
  `127.0.0.1` by default and to the private NIC only when leased (heavy-a8).
- **GPU workloads:** the `gpu/` branch already proves the pattern — the GPU box
  publishes `~/.gpu_endpoint.json` (`GPU_STATE`) and the gateway proxies to it.
  A video-AI backend that needs a GPU follows the same handshake: the GPU host
  registers an endpoint, the gateway routes `video/<model>` to it. No GPU code
  lives in the gateway itself; the gateway is a router.
- **Isolation:** one worker for the proxy; heavy video inference runs in the GPU
  backend process, so a video job cannot stall the chat passthrough.

## Migration steps + risks

1. Copy `gateway.py` into the service; make `ENV_PATH`/`GPU_STATE` configurable
   (they are already `AGENT_OFFICE_ENV`/`HOME`-derived at `:18-19`) so nothing
   office-specific is hard-coded.
2. Generalise `resolve()` (`:38`) into a `backends/` registry; keep the four
   existing prefixes byte-for-byte behaviour-compatible.
3. Add the `app.py` FastAPI wiring (LitServe's `OpenAISpec` stays the
   `/v1/chat/completions` route).
4. Add the `video/` backend descriptor + `/v1/video/jobs` endpoints.
5. Point `server.js:47`/`console.js:18` at the service; the office pm2 entry
   (`server.js:42`) becomes a `systemd` unit.

**Risks:**
- **litserve/MCP shim (low):** `:14` disables MCP because the installed `mcp`
  pkg clashes with litserve 0.2.16 — carry that pin into the service's deps.
- **Key handling (medium):** the service reads secrets per request; the
  standalone version must keep "never logged" (`:8`) and bind 127.0.0.1 until
  leasing (heavy-a8) explicitly opens a port.
- **GPU endpoint trust (medium):** `GPU_STATE` (`:51`) is read from a file
  written by the GPU host — validate the token/base_url before proxying.
- **No video code exists (info):** the video workload is net-new; this plan
  extracts the *serving shell* and specifies the video backend, it does not
  claim to move existing video code (there is none).

## Verdict

Feasible: extract the LitServe/FastAPI gateway (`gateway/gateway.py`) as the
standalone service shell, with `resolve()` as the backend-config pattern, and
add the video-AI workload as a new `video/` backend. Recommended sequencing:
pair with heavy-a8 (leasing) since this is the first engine that becomes a
leased service. No live code touched by this plan.
