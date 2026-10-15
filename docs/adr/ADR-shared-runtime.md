# ADR: shared agent runtime (the d-chain)

- **Status:** Proposed (heavy-d2). Governs the heavy-d-chain (d3 build plan onward).
- **Date:** 2026-10-12
- **Supersedes/deptends on:** `docs/adr/ADR-engine-extract.md` (the engine-extract
  levers: `E`/`render`/`moat`/`lease`), the leasing plan
  `docs/plans/leasing-model.md` (heavy-a8), and the agent-office runtime
  (`agent-office/server.js`, `agent-office/colony.js`, `agent-office/gateway/gateway.py`).

## Context

Today the "agent runtime" is not one thing — it is three overlapping,
per-concern implementations that each grew in place:

1. **The office control plane** — `agent-office/server.js`: a Node HTTP server
   listing pm2/bot/session seats (`:31-53`), holding a heartbeat table
   (`:63` `heartbeats`, `:65` `HB_FILE = heartbeats.json`) with stale pruning
   (`:67-78`, added as upg-u-203), and proxying model calls.
2. **The model gateway** — `agent-office/gateway/gateway.py`: a LitServe /
   FastAPI service, *"one OpenAI-compatible endpoint (127.0.0.1:8860/v1) in front
   of every office backend"* (`:1`), routing by prefix in `resolve(model)`
   (`:38`): `lightning/`, `ollama/`, `gpu/`, `inference/`.
3. **The profit colony** — `agent-office/colony.js`: the "Data Cleaning Colony"
   desk reading per-agent ledgers (`profit-agents/colony/<id>/ledger.json`,
   `colony.js:3-6`), running `colony.py` for spawn/dispatch/credit, with costs
   *simulated* ($0.05/job) and *"Nothing here accepts gigs, sends files, or
   touches money/crypto"* (`:6`).

Each has its own notion of identity, metering and safety. The leasing model
(`docs/plans/leasing-model.md:1` "the leasing model (`lease` stays closed)")
already assumes a runtime that could meter and isolate tenants — §1.1 fixes the
invariant that `lease` can only be `closed` today (`leasing-model.md:21`), §1.3
catalogs what already works and would be reused (`:79`), §1.4 what is
deliberately absent (`:166`). This ADR defines the runtime those pieces would
consolidate into.

## Decision

Adopt a **single shared agent runtime** with seven concerns behind one boundary,
extracted from the three implementations above. The runtime is a **library +
thin service**, not a rewrite: it generalises what exists, keeps `lease` closed
by default, and is receive-only on crypto (standing rule 2 in
`handoff/README.md`).

### The seven concerns

| Concern | Today (file:line) | In the runtime |
|---|---|---|
| **Registry** | seats at `server.js:31-53`; heartbeats `:63-78` | a `Runtime.register(agent)` + heartbeat store (the `heartbeats.json` model, generalised) |
| **Training** | `gpu/` backend in `gateway.py:51`; `colony.py` selftrain | a training job kind routed like `resolve()` (`:38`) |
| **Rental** | `lease` invariant `leasing-model.md:21` | a `Lease` interface that is **closed** unless Sun opens it (`leasing-model.md:185`) |
| **Metering** | colony ledger `colony.js:3-6`; credit `profit-agents/agent.py` | a `Meter` emitting usage events (see below) |
| **Billing** | simulated $0.05/job `colony.js:5` | a `Ledger` that records real usage once revenue is real (heavy-d3/b) |
| **Safety** | colony read-only inbox `colony.js:6`; gateway local-only `gateway.py:8` | a `Guard` enforcing the receive-only/no-crypto posture per call |
| **Audit** | per-agent `ledger.json` | an append-only event log (one row per runtime action) |

### Metering hook (what is measured)

Uniform units so any engine can be metered — matching the leasing plan's
"GPU-seconds / calls" idea (`leasing-model.md:219`):
- **model calls** — one per `resolve()` dispatch (`gateway.py:38`);
- **tokens** — from the OpenAI-shaped response (`gateway.py:11` OpenAISpec);
- **GPU-seconds** — from the `gpu/` backend handshake (`gateway.py:51`,
  `~/.gpu_endpoint.json` `:19`);
- **job-minutes** — the colony's existing per-job cost (`colony.js:5`).

The `Meter` is a pure function `(action, backend, usage) -> event`, so it is
testable in isolation and every concern above can emit one.

### Tenancy / isolation

- **Today:** everything is `127.0.0.1`-only and single-tenant
  (`gateway.py:8`, `server.js` binds the office port). Isolation is process
  isolation via pm2 (`server.js:42` gateway process).
- **Runtime:** a `Tenant` keyed by API token (the `resolve()` key model
  `gateway.py:38` becomes a per-tenant key), with per-tenant quotas enforced in
  `Guard`. Until a lease opens, there is exactly one tenant (the studio itself),
  so tenancy is a no-op — but the seam exists.

### Crypto posture (hard constraint)

Receive-only. No on-chain leasing, escrow or token flows until Sun approves
(`handoff/README.md` standing rule 2; `leasing-model.md:1` keeps `lease` closed;
devnet-only posture in `src/config/neura.ts:2-11`). The runtime's `Rental` and
`Billing` concerns must be able to enforce "closed" as the default.

## Phased build (for heavy-d3)

1. **d3.0 — Meter + Audit** (pure, no behaviour change): add the `Meter` event
   shape and the append-only log, wired to the existing gateway dispatch
   (`gateway.py:38`) and colony credit (`colony.js`). Leasing stays closed.
2. **d3.1 — Registry unification:** generalise `server.js:63-78` heartbeats into
   the `Runtime.register` store; office reads from the runtime.
3. **d3.2 — Guard + Tenant seam:** wrap `resolve()` (`gateway.py:38`) so every
   dispatch passes `Guard`; single tenant, no-op quotas.
4. **d3.3 — Training + Rental interfaces:** define them closed; only open on
   Sun's approval.
5. **d3.4 — Billing:** replace the simulated `$0.05/job` (`colony.js:5`) with the
   real ledger fed by `Meter`, gated on the heavy-b4 profit split.

## Consequences

- **Good:** one identity/meter/safety model instead of three; the leasing model
  (`leasing-model.md`) gets the runtime it assumed; the extraction (heavy-a) and
  leasing (heavy-a8) work composes cleanly.
- **Cost:** touching `server.js` (a live-adjacent file) requires the phases above
  to be additive — never a rewrite of the running office in one step.
- **Risk:** the runtime must stay `127.0.0.1`-only until a lease explicitly opens
  a port, or the local-only guarantee (`gateway.py:8`) is lost.

## Alternatives considered

- **Do nothing (three implementations stay).** Rejected: the leasing model needs a
  single meter/identity (`leasing-model.md:79`), and three safety models drift.
- **Big-bang rewrite of agent-office.** Rejected: it is live-adjacent (pm2, the
  office on `127.0.0.1:8847`); additive phases only.
- **Separate runtime per concern.** Rejected: three runtimes is the current
  problem, not the solution.

## Acceptance

This ADR exists and every claim above cites a file:line in the current repo. No
runtime code is built by heavy-d2 — that is heavy-d3.
