# Audit: feat/reception-handoff — GO-WITH-FIXES

- **Verdict:** GO-WITH-FIXES
- **Date:** 2026-10-11 (post go-live merge; the branch is now merged into main)
- **Scope:** `src/world/workverse/ReceptionDesk.tsx`, `reception.ts`, `receptionSummary.ts` (+test), `WorkverseScene.tsx` mount, package.json test script.
- **Method:** read-only review of the merged code on main; no changes made in this audit.

## Summary

A Workverse reception desk that renders the creed plus live board counts from the
Agent Office reception API, via a server-side proxy. The security design is
sound: credentials never reach the browser, the browser receives only a
sanitised count summary, and the pure sanitiser is unit-tested. Two issues
(fail-open credential fallback, unbounded agent list in the DOM) and several
smaller notes below.

## Security

**GOOD**
- `reception.ts:17-30` — office basic-auth credentials are read from
  `AGENT_OFFICE_USER/PASSWORD` env or the 0600 `~/.agent-office/env` file
  **server-side only**; the browser never sees them. No token, brief body, or
  ledger text crosses the boundary.
- `receptionSummary.ts:33-67` — `summarizeBoard` is a pure allow-list sanitiser:
  it keeps only counts, string ids/roles/states (clipped to 80/40/12 chars) and
  booleans. Notes, tokens, briefs and ledger entries are structurally dropped.
- `reception.ts:12` — the server fn sits behind `authMiddleware`; an anonymous
  visitor gets nothing.
- `reception.ts:34` — `AbortSignal.timeout(5000)` bounds a hung office.

**ISSUE 1 (fail-open credential fallback) — fix before relying on this in prod**
- `reception.ts:27` — `user = get("BASIC_AUTH_USER") || "wei"`. If the env file
  exists but the user key is missing/empty, the code falls back to the hardcoded
  username `"wei"` instead of failing closed. A wrong-username + right-password
  pair 401s (safe), but the fallback silently masks a misconfigured env file and
  hardcodes a real account name into source. **Fix:** drop the `|| "wei"`;
  require both user and pass or return `emptySummary("office login not
  configured")`.
- Related, `reception.ts:22` — `fs.readFileSync(envFile)` is inside the `try`, so
  a missing file is caught and fails closed (`emptySummary`). That part is fine.

**ISSUE 2 (agent list rendered unbounded) — low**
- `ReceptionDesk.tsx:76-81` — `s.agents.map(...)` renders every agent the
  summary carries. `summarizeBoard` caps at 40 (`receptionSummary.ts:50`), so
  the DOM is bounded — but 40 rows inside a 300px `Html` overlay with
  `maxHeight: 220, overflow: auto` is a scroll prison on mobile. Cosmetic; cap
  the render to ~8 with a "+N more" line if the list grows.

**NOTES**
- `reception.ts:24` — the env parser builds a `RegExp` from the key. Keys are
  literals (`BASIC_AUTH_USER`), so no injection; but `new RegExp` per key is
  wasteful — a plain line-split parse would do.
- No secret-like strings found in the browser bundle path: `grep -rn
  "BASIC_AUTH\|rag_\|token" src/world/workverse/` shows only the server-side
  env reads.

## Correctness

- `receptionSummary.ts:38` — `by(s)` counts by exact status string. The board's
  statuses (`open`, `in_progress`, `done`, `blocked`, `cancelled`) match; a
  renamed status would silently count 0. Acceptable for a count display; a
  `total - known` sanity check would catch drift.
- `receptionSummary.ts:47` — `blockedOnSun` counts `kind === "blocked-on-sun"`,
  not `status === "blocked"`. A task could be `blocked` with a different kind and
  be missed. Minor: the UI label is "Sun", so counting the kind is arguably the
  intent — but it diverges from the other counts (which use status). Worth a
  comment or aligning.
- `ReceptionDesk.tsx:22` — `setInterval(load, 30000)` re-fetches every 30s and
  the interval is cleared on unmount (`:24-26`) — no leak. The `alive` guard
  (`:19-20`) prevents setState after unmount. Good.
- `receptionSummary.ts:56` — `verified: a.registered === true` — correct: the
  board reports `registered`/`revoked`, not `verified`.

## Performance

- One `fetch` per mount + one per 30s, bounded by a 5s timeout — negligible.
- The 3D desk is a handful of boxes + one `pointLight`; the `Html` overlay only
  mounts when the component does. No per-frame cost.

## Missing tests

- `receptionSummary.test.ts` covers the sanitiser (present, passing).
- **Missing:** a test that `summarizeBoard` drops forbidden fields (notes,
  tokens, brief bodies) — the current test asserts what it keeps, not what it
  must drop. Add a negative test: feed a board with `notes: [{secret}]` and
  `tokens` and assert the output has neither key. This is the security-critical
  property and it deserves an explicit test.
- **Missing:** a test for `receptionEnabled` (flag on/off, `?reception=0`).

## Files reviewed

| File | Lines | Verdict |
|---|---|---|
| src/world/workverse/reception.ts | 41 | GO after Issue 1 |
| src/world/workverse/receptionSummary.ts | 90 | GO (add negative test) |
| src/world/workverse/ReceptionDesk.tsx | 103 | GO (cap the agent list) |
| src/world/workverse/receptionSummary.test.ts | 43 | extend with negative cases |

## Recommendation

Fix Issue 1 (remove the `"wei"` fallback — one line) and add the negative
sanitiser test, then this is GO for production. The credential boundary design
is correct and the sanitiser is the right shape; the gaps are a fail-open
fallback and a missing negative test, both small.
