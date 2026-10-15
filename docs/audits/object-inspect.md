# Audit: feat/object-inspect — GO-WITH-FIXES

- **Verdict:** GO-WITH-FIXES
- **Date:** 2026-10-11 (post go-live merge; branch now merged into main, carrying
  the 0019→0020 migration renumber)
- **Scope:** `src/world/inspect/*` (flag, runtime, pick, profile, tagPolicy,
  affordances, dates, tags.server.ts, InspectSheet/InspectSlot), the PGLite
  migration test.
- **Method:** read-only review of the merged code on main.

## Summary

Long-press/right-click/i to inspect OSM buildings, props and the user's own
scans, with a server-side tag lookup behind a rate limiter and a privacy
allow-list. The privacy design is the strongest part: `tagPolicy.ts` drops
owner/free-text keys and caps values; the server lookup is off by default and
rate-limited per client IP. The picker priority chain is correct and well-tested
(wave-3 added explicit UI-over-world tests). Issues are a spoofable rate-limit
key and a missing input validation on the server fn.

## Security

**GOOD**
- `inspect/tagPolicy.ts:3` — owner and free-text keys always dropped, max 40
  keys, values ≤ 200 chars. The privacy allow-list is explicit and tested
  (`inspect.privacy.test.ts`).
- `inspect/tags.server.ts:15` — server lookup OFF unless `INSPECT_ENABLED=true`
  or dev; the card still works from feature props alone. Fail-closed default.
- `inspect/tags.server.ts:12,31` — rate limiter 30 req/60s per client key.
- `inspect/tags.server.ts:38` — Overpass call has an 18s abort and rethrows on
  429/5xx for back-off. No unbounded fetch.
- `tags.server.ts` interpolation — `way(${input.id})` interpolates `input.id`
  into the Overpass query. **Check:** is `input.id` validated as an integer
  before interpolation? See Issue 1.

**ISSUE 1 (Overpass query injection via unvalidated id) — fix**
- `tags.server.ts:38` — `[out:json][timeout:15];way(${input.id});out tags;`
  interpolates `input.id` directly into the Overpass QL string. If `input.id`
  is not strictly validated as an integer upstream (the picker produces OSM ids,
  but a crafted client could send `1);out;...` or `1 or true`), the query string
  is attacker-influenced. Overpass QL injection here means arbitrary (read-only)
  Overpass queries through your rate-limited endpoint — a minor abuse vector,
  not data exfiltration (the response is still run through tagPolicy). **Fix:**
  `if (!Number.isSafeInteger(input.id) || input.id <= 0) return {ok:false,
  reason:"missing"}` before the query. One line, closes it.

**ISSUE 2 (rate-limit key is client-spoofable) — low**
- `tags.server.ts:19-25` — `clientKey()` trusts `cf-connecting-ip` /
  `x-forwarded-for` / `x-real-ip`. Behind the office tunnel these are set by
  Cloudflare, but if the endpoint is reachable without the proxy (or a client
  sends its own `x-forwarded-for`), the key is attacker-chosen and the limiter
  is trivially bypassed (rotate the header per request). **Fix:** only trust the
  IP headers when the immediate peer is the known proxy, else fall back to the
  socket peer; or key on a hash of (ip + a stable session marker). Medium
  priority — it degrades the rate limit to advisory, not a security hole.

**NOTES**
- No secrets in the inspect path; the Overpass URL is public config.

## Correctness

**GOOD**
- Picker chain (`inspect/pick.ts`): placing → life → scan-vs-building (distance,
  1.5 m tolerance) → building. Wave-3 tests pin all four. The 6px pick with a
  22px retry (`PICK_PX`/`RETRY_PX`) is a good touch-target compromise.
- `profile.ts` — field provenance (`scan`/`owner`/`computed`/`catalogue`)
  drives confidence; owner values are clamped and labelled. Privacy-aware by
  construction.
- `affordances.ts:51` — `link_record` requires owner + property-ready + consent;
  refuses otherwise. Correct gating.
- Migration renumber (0019→0020) — verified in the merge: git recorded a 100%
  rename, the PGLite test applies migrations by sorted basename, and both doc
  references were updated. The clash with main's `0019_disputes.sql` is gone.

**NOTES**
- `dates.ts` — parsed start dates feed the age/confidence display; no validation
  issues seen.

## Performance

- Tag lookup is cached per cell/id (`tagCache.ts`) with a limiter; a cold miss
  costs one Overpass round-trip (bounded 18s). Acceptable.
- `runtime.ts` mounts the inspect chunk lazily (only when the flag is on and a
  pick happens) — no eager cost.

## Missing tests

- `inspect.test.ts` (69 pass) + `inspect.privacy.test.ts` + wave-3 picker tests
  cover the core.
- **Missing:** a server-fn input-validation test (Issue 1): `serveInspectTags`
  with `id: "1);out;"` or `id: 1.5` or `id: -1` must return
  `{ok:false, reason:"missing"}` — currently untested.
- **Missing:** a rate-limit test (30 req pass, 31st returns busy) — the limiter
  is pure (`createLimiter`) and trivially testable; worth pinning.

## Files reviewed

| Area | Files | Verdict |
|---|---|---|
| privacy | tagPolicy.ts, profile.ts, inspect.privacy.test.ts | GO (strong) |
| server | tags.server.ts, tagCache.ts | GO after Issues 1+2 |
| picker | pick.ts, runtime.ts | GO (well-tested) |
| UI | InspectSheet.tsx, InspectSlot.tsx, affordances.ts, dates.ts | GO |
| migration | 0020_object_attributes.sql + PGLite test | GO (renumber verified) |

## Recommendation

Fix Issue 1 (validate `input.id` as a safe integer before the Overpass
interpolation — one line, closes the injection) and add its test. Issue 2
(proxy-trust for the rate-limit key) can follow. The privacy model and picker
are genuinely well-built. GO for production after the id validation lands.
