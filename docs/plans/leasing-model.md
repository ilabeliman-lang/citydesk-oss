# Plan: the leasing model (`lease` stays closed)

- **Status:** Plan only (heavy-a8). No code moved; no `src/` or `migrations/`
  file was modified by this ticket.
- **Scope:** the machine/GPU/agent leasing surface — `processing_units`,
  `machine_agents`, `gpu_nodes`, `compute_nodes`, `compute_hires`,
  `gpu_jobs`/`gpu_shards`, `dispatch_log`, the chunk planner, and the Agent
  Board / Compute desk UI that renders them.
- **Prerequisite reading:** `docs/adr/ADR-engine-extract.md` (Option A, seven
  packages — the leasing surface is **app-side**, see §1.2),
  `handoff/AGENT_MARKETPLACE_PLAN.md` (the marketplace the leasing model would
  eventually feed — `rentals(...)` at §3.1, `heavy-d6` rental/scheduler),
  `handoff/README.md` standing rule 2 (receive-only crypto; **no on-chain
  leasing/escrow/token flows until Sun approves**), `src/config/neura.ts:2-11`
  (devnet-only posture, no mainnet switch).
- Every `file:line` below is verified in this worktree at branch
  `feat/impl-heavy-a8` (base `citydesk-impl-docs` main, `7a2f818`).

## 1. What the leasing model is today

### 1.1 The one invariant: `lease` can only be `closed`

Four tables carry a `lease` column, and in all four the CHECK constraint
permits exactly one value:

| Table | Migration | Constraint | Meaning (from the file header) |
|---|---|---|---|
| `processing_units` | `migrations/0017_units.sql:10` | `check (lease in ('closed'))` | "Devices an owner put in the pool. Nothing is discovered or claimed from a scan." (`:1`) |
| `machine_agents` | `migrations/0015_machine_agents.sql:13` | `check (lease in ('closed'))` | "A row is a listing, not a lease. lease can only be closed: nobody outside can run code on the machine." (`:1-2`) |
| `gpu_nodes` | `migrations/0016_gpu_jobs.sql:8` | `check (lease in ('closed'))` | "A split job and the cards that ran it. Amounts are a ledger only. Nothing is paid." (`:1`) |
| `compute_nodes` | `migrations/0014_compute_nodes.sql` | **no `lease` column at all** | "A person offers a machine by name. Listing does not pay anyone. A hire is still the existing devnet transfer the user signs. Mainnet stays off." (`:1-2`) |

The invariant is enforced in three independent places, and that redundancy is
the design:

1. **Schema** — the CHECK above rejects any other value at the DB.
2. **Writers** — every insert/update hardcodes `'closed'`:
   `src/world/agents/units.ts:63-65` (CPU enroll), `:81-83` (phone slot, also
   on conflict), `src/world/agents/market.ts:105-107` (machine register).
   No code path anywhere writes a different value (grep for `lease` across
   `src/`, `server/`, `scripts/` returns only `'closed'` literals and the
   literal type `lease: "closed"` at `market.ts:20`).
3. **UI** — the copy states it to the user every time:
   `src/world/agents/AgentBoard.tsx:41` ("Lease stays closed. No stranger can
   run code here."), `:45` and `:68` (per-row "· lease closed"), `:55`, `:77`,
   `:83` (per-action confirmations). The background loop says the same in its
   own header: `scripts/agent-tick.mjs:3` "No shell. No lease."

Consequence: **a lease is a listing plus a name.** `compute_nodes` is the
purest form — a person offers a machine (`src/world/nodes.ts:30-50`,
status `offered`), can pause it (`:52-64`, status `paused`), and the list is
read-only to everyone else (`:8-28`). No file list, no wallet, no payee, no
execution endpoint. Offering a machine moves nothing.

### 1.2 Where this sits in the ADR's package map

`ADR-engine-extract.md` assigns the engine packages (§ "Package boundaries",
lines 62-86) and states the crossing rule at `:103`: **no package imports
another app's domain (no property, auth, or Neura code in the engine)**.

The leasing surface is therefore **app-side by construction**:

- `src/world/agents/units.ts`, `market.ts`, `dispatch.ts` and
  `src/world/nodes.ts`, `neura.ts` all import `createServerFn` from
  `@tanstack/react-start`, `getSql` from `@/lib/db`, and `authMiddleware` from
  `@/lib/auth/middleware` — all three are named in the ADR's must-NOT-cross
  list (`ADR-engine-extract.md:103`).
- The only pure module in the whole surface is the planner:
  `src/world/agents/chunks.ts` (57 lines, zero imports beyond its own types)
  and its sibling `src/world/agents/batch.ts` (23 lines, imports only
  `./chunks.ts`). These are the *scheduling* half of leasing and are the only
  extractable piece — see §2.

So heavy-a8 does **not** propose moving leasing into an engine package. It
proposes a plan for the leasing model itself: what it would take to open a
lease, what stays closed, and what is already built that a future lease would
reuse.

### 1.3 What already works (and would be reused by a real lease)

**a) The chunk planner** — `src/world/agents/chunks.ts`

- `ALLOWS` (`:19-24`): per-kind job allowlist — `phone`/`iot`/`cpu` → `tile`
  only; `gpu` → `tile` + `video`. This is the capability matrix a lease would
  negotiate against.
- `CHUNK_CAP` (`:27-32`): server-clamped per-kind maximums — phone 64 KB,
  iot 16 KB, cpu 1 MB, gpu 8 MB. `units.ts:62` clamps the CPU's own claim to
  `min(CHUNK_CAP.cpu, max(64 KB, ram/8))` — a self-reported unit cannot
  overstate its capacity.
- `planChunks` (`:34-57`): filters to idle + kind-allowed + positive-capacity
  units, sorts largest-first, greedily assigns, and returns
  `{ assignments, unassigned, reason }` with a plain-words explanation for
  every outcome (`:48-55`). Already unit-tested at
  `src/world/agents/batch.test.ts` (60 lines).
- `planBatch` (`src/world/agents/batch.ts:5-23`): the video rule — a video
  **stays on one GPU** that can hold the whole job; it never splits. That is a
  scheduling decision a lease would inherit, not re-derive.

**b) The payment rail** — `compute_hires` + the devnet hire flow

`migrations/0007_neura_wallet_compute.sql:24-27` documents the state machine
and `src/world/neura.ts` implements it end to end:

```
intent ──(user signs message, no gas)──▶ signed ──(user signs devnet transfer)──▶ paid_devnet ──▶ [cancelled]
   │ createHireIntent  :218           │ signHireIntent :262        submitHireTransfer :301   cancelHire :360
   └──────────────────────────────────┴───────────────────────────┴── recheckHire :334 (recovery)
```

Properties a lease would inherit, verified in code:

- The server **never holds a key and never signs**: the wallet-link nonce
  (`:55-76`, 10-minute TTL at `:14`) is a *message* signature; the transfer is
  built unsigned (`:279-298`) and relayed only after the user signs it
  (`:301-331`). `src/world/neura.server.ts:4-9` states the posture.
- **Price is server-side.** `createHireIntent:234` looks the offer up via
  `findOffer` (`neura.server.ts:566-576`) and rejects an unpriced listing
  (`:236`); the client can only pass `offerId` + `token` (`:220-223`). The
  catalog — including the three GPU rental tiers — lives at
  `neura.server.ts:438-444` with the comment "the client never sets a price".
- **Devnet only, verified.** Every connection is checked against the devnet
  genesis hash (`neura.server.ts:98` + `src/config/neura.ts:8`); the memo
  program carries `ndu-hire:<id>` on every transfer (`neura.ts:296`, `:315`).
- **Rate limit:** 20 hires per user per day (`neura.ts:15`, enforced `:230`).
- **Dispatcher hand-off** is a second wallet-signed step, off-chain:
  `prepareDispatcherJob:373-394` builds the canonical `create_job` message
  (must match the dispatcher byte-for-byte, `neura.server.ts:529-532`),
  `queueDispatcherJob:397-423` verifies the signature and POSTs `/jobs`. A
  hire that is not `paid_devnet` cannot be queued (`:378`, `:406`).

**c) The ledger that already exists** — `gpu_jobs` / `gpu_shards`

`migrations/0016_gpu_jobs.sql:12-39` defines the metering tables a lease would
bill from: per job `shards`, `frames`, `useful_gpu_ms`, `billed_seconds`,
`gross_usd`, `fee_usd`, `node_usd`, `paid boolean default false`,
`output_sha256`; per shard `frames`, `checksum`, `gpu_ms`, `flops`,
`learn_start`, `learn_end`. The header is explicit: "Amounts are a ledger
only. Nothing is paid."

**Finding (real, and worth recording):** nothing in `src/`, `server/` or
`scripts/` reads or writes `gpu_jobs`, `gpu_shards`, or `gpu_nodes`. They are
schema-only — the metering *shape* was designed and never wired. The only
writer into the leasing-adjacent tables is `dispatch_log`
(`migrations/0018_dispatch.sql`, written by `dispatch.ts:31` with the single
allowed status `'recorded'`), whose header says "The bytes are not executed.
The unit is left idle." So today: plan → record → done. No execution, no
metering read-back, no payment beyond the demo hire.

**d) The agent side** — `machine_agents` + `knowledge_pool`

`src/world/agents/market.ts` registers two roles (`commander`,
`distiller`, `:104-111`), each pinned to a single duty string
(`DUTY` at `:9`: "Rewrite one note already in the pool. Do not run code. Do
not invent a fact."), and `tickAgent` (`:116-176`) runs exactly one
distillation step: pick a pool note under version 3 with no child and no
recent failure (`:132-140`), call the local model at 127.0.0.1:11535
(`:146-156`), screen the reply through `accept()` (`:58-64` — rejects
`sudo`, `rm -`, code fences, `curl`/`wget`, `$(`, "ignore previous", anything
under 12 chars), then insert a new version (`:164-165`). A partial unique
index `agent_jobs_one_running` (`migrations/0015_machine_agents.sql:45`)
guarantees at most one running step, and stalled jobs are failed after three
minutes (`market.ts:123-124`). The seeded pool note says it outright:
`market.ts:50` "This machine has no GPU, so it cannot train weights and it is
not leased out."

### 1.4 What is deliberately absent

- **No discovery.** Nothing scans the network for machines
  (`migrations/0017_units.sql:1`; `AgentBoard.tsx:64` "Devices found on the
  internet are not a pool"). A unit exists only because its owner enrolled it
  from that machine (`units.ts:56`, `:74`).
- **No remote execution endpoint.** There is no route, server fn, or socket
  that accepts code or a job payload from another user. `dispatch.ts:31`
  records bytes; it does not run them.
- **No cross-user write path.** Every handler is `authMiddleware`-scoped to
  `context.userId` and every mutating SQL carries `user_id = ${context.userId}`
  (`units.ts:65`, `:83`, `:94`; `market.ts:106-107`; `nodes.ts:59`;
  `neura.ts:195`, `:206`, `:253-256`, `:323-324`, `:366`, `:419-421`).
- **No mainnet, no custody.** `src/config/neura.ts:2-11` — devnet only, no
  mainnet switch in the build; `handoff/README.md:102` standing rule 2 —
  no on-chain leasing/escrow/token flows until Sun explicitly approves.

## 2. The plan

### 2.1 Keep `lease` closed (recommended, and the default state)

The honest recommendation is **no change**. The schema, the writers, and the
UI already agree, the payment rail is devnet-only and user-signed, and
`handoff/README.md:102` makes an open lease a blocked-on-Sun decision, not an
engineering one. Opening a lease means someone else's code runs on a machine
Sun owns — that is a security decision with no engineering shortcut.

### 2.2 The only extractable piece: `@citydesk/chunk-plan`

The planner is pure, tested, and is the one part of the leasing model with no
server, no auth, and no domain coupling — so it is the one part that *could*
live in a package under the ADR's rules (`ADR-engine-extract.md:103` allows it
because it has no imports at all). Candidate shape, mirroring the
`@citydesk/realism` plan (`docs/plans/ndu-extract.md` §2):

```
packages/chunk-plan/
  package.json      # subpath exports "." and "./batch"
  tsconfig.json
  src/chunks.ts     # from src/world/agents/chunks.ts (verbatim — zero imports)
  src/batch.ts      # from src/world/agents/batch.ts (imports only ./chunks)
  test/batch.test.ts# from src/world/agents/batch.test.ts
```

Public surface: `planChunks`, `planBatch`, `CHUNK_CAP`, `ALLOWS`, and the
types `UnitKind`, `JobKind`, `UnitOffer`, `ChunkPlan`. CityDesk then imports
`@citydesk/chunk-plan` in `units.ts:6`, `dispatch.ts:5`, `batch.ts:3`, and
`AgentBoard.tsx:4`.

This is optional and small; it is listed so the extract programme has one
decision on record rather than an open question. It does not unblock anything
else and can be deferred without cost.

### 2.3 If a lease is ever opened (blocked-on-Sun) — the shape it would take

Recorded so a future reader does not have to re-derive it. Each item names
what already exists and what would be new:

| Concern | Exists today | Would be new |
|---|---|---|
| Capability negotiation | `ALLOWS`, `CHUNK_CAP` (`chunks.ts:19-32`) | a lease term encoding the same allowlist, agreed per lease |
| Capacity claim | server clamp at `units.ts:62` | a verified claim (measured, not self-reported) |
| Scheduling | `planChunks` / `planBatch` | a lease-aware planner that prefers leased units over idle ones |
| Execution | **nothing** — `dispatch_log` is a record only (`migrations/0018_dispatch.sql:1`) | a sandboxed runner; today's absence is the safest property in the system |
| Metering | `gpu_jobs`/`gpu_shards` schema (`migrations/0016_gpu_jobs.sql:12-39`) — **unwired** | the write path (a worker) and the read path (a bill) |
| Payment | the devnet hire flow (`neura.ts:218-358`) | a payout leg; today's flow is renter → payee only, one direction |
| Ledger honesty | `paid boolean default false` (`migrations/0016_gpu_jobs.sql:23`) | an actual settlement step; the default keeps every row unpaid |
| Policy | `accept()` screening (`market.ts:58-64`), one-running index (`:45`) | a per-lease policy pack (the marketplace plan's §3.2 safety policy) |

The hard blockers, in order: (1) Sun approves any on-chain leasing/escrow
flow (`handoff/README.md:102`); (2) a mainnet decision with its own gated
change (`src/config/neura.ts:2-6`); (3) an execution sandbox that does not
exist and is not designed here.

### 2.4 Two small consistency fixes worth doing regardless

These are doc/UI wording, not behaviour, and are listed because a reader
comparing the tables will otherwise wonder:

1. `compute_nodes` has no `lease` column while the other three listing tables
   do. Either add `lease text not null default 'closed' check (lease in
   ('closed'))` for symmetry (`migrations/0014_compute_nodes.sql:3-13`), or
   drop the column from the other three — **recommend adding it**, so the
   invariant is visible in one place per table and a future migration that
   opens a lease finds all four in one grep.
2. `gpu_nodes`/`gpu_jobs`/`gpu_shards` are schema-only. Either wire the
   metering write path or mark the tables in a migration comment as reserved
   (`migrations/0016_gpu_jobs.sql:1` already says "Amounts are a ledger only.
   Nothing is paid." — a one-line "reserved, not yet wired" would make the
   gap unambiguous to the next reader).

Neither is required for this ticket; both are cheap and prevent a future
agent from assuming the ledger is live.

## 3. Acceptance

This ticket (heavy-a8) is **plan only**: this document exists with `file:line`
evidence, `npm run typecheck` stays at 0 errors, and no `src/`, `server/`,
`scripts/` or `migrations/` file was modified. §2.4's two items are
recommendations for a later ticket, not work done here.

Verified gates for this commit:

- `flock /tmp/impl-gate.lock bash -c 'npm run typecheck'` — 0 errors
  (doc-only change; the gate is run to honour the serialized contract).
- `git status` clean after commit; branch `feat/impl-heavy-a8`, single commit
  on top of `7a2f818`.

## 4. Open questions for Sun

1. Does an open lease ever get approved at all? If the answer is no, `lease`
   stays `closed` forever and the only remaining work is §2.4's symmetry fix.
2. If yes: sandboxed execution on a Sun-owned machine is the gate. Is that
   ever in scope, or does leasing stay a *listing* concept permanently (the
   current design) with payment only for dispatcher jobs Sun's own nodes run?
3. Should `@citydesk/chunk-plan` (§2.2) be extracted now for its own sake, or
   left in the app until a second consumer actually appears?
