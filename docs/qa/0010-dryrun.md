# QA: migration 0010 dry run + property integration tests (WS-B)

- **When:** 2026-10-08 00:12 to 00:25 HST (10:12 to 10:25 UTC), studio the primary host.
- **Branch:** `test/property-qa` (worktree `$CITYDESK_HOME-qa`, based on `e992e2b`).
- **What was tested:** read-only copies of the other bot's **uncommitted** files, snapshotted at
  **2026-10-08T10:12:37Z (00:12 HST)**. These copies are test fixtures only. They are not committed on this branch and were not modified.

| Fixture (copied from the shared checkout) | sha256 at snapshot |
|---|---|
| `migrations/0010_property_core.sql` | `6bb37bc1d56a1f58…` |
| `src/world/property.server.ts` | `21025810579430c5…` |
| `src/config/neura.ts` (adds `PROPERTY`) | `a51726601df1edac…` |
| `src/world/scan-store.server.ts` (exports `scanRoot`) | `6132ba5fb9f9a646…` |
| `src/lib/property/commit.ts` · `envelope.server.ts` · `metadata.ts` · `strip.server.ts` | `68a498ee…` · `bea93361…` · `4a06ac06…` · `f8f83768…` |

## 1. Migration dry run: no SQL errors

A throwaway **Postgres 16.x** cluster ran on `127.0.0.1:5440` from `/usr/lib/postgresql/16/bin`.
It used its own data dir `/tmp/ndu-qa-pg`, trust auth, and db `citydesk_qa`, ran as a separate process, and was stopped and deleted afterwards.
It is **not** `citydesk-pg` (`:5436`), which was never contacted.

```
DATABASE_URL=postgres://qa@127.0.0.1:5440/citydesk_qa node scripts/migrate.mjs
[migrate] applied 0001_auth.sql … 0009_scan_assets.sql
[migrate] applied 0010_property_core.sql
[migrate] done — 10 migration(s) applied.
# re-run → "[migrate] up to date."   (idempotent)
```

- All 10 files applied in order, each in its own transaction, with **0 errors and 0 warnings**. All 9 `property_*` tables were created.
- **PGLite** (`tests/property/pglite-dryrun.mjs`, the dev/preview fallback engine in `src/lib/db.ts`) also applied all 10 files with no errors.
- **No exact-line SQL fixes are needed for 0010.**

### Schema review notes (no errors; suggestions only, do not block applying 0010)

| # | Where | Note | Suggested change |
|---|---|---|---|
| S1 | 0010 L58 `property_items.group_id references property_groups (id)` | No `on delete` action, so deleting a group that still has items fails with an FK error. No delete-group function exists yet. | Decide the policy when group deletion is built: `on delete restrict` (explicit) plus a friendly error, or move the items to `personal` first. |
| S2 | 0010 L89 `property_item_evidence_live` unique `(item_id, kind) where shredded_at is null` | This is correct. However, `storeEvidence` runs shred and insert as separate autocommit statements, so two parallel uploads of the same kind hit this index and return a raw `23505` (HTTP 500). The orphan file is cleaned up. | Wrap shred + insert + commitment in one transaction with `select … for update` on the item row, or map `23505` to `PropertyError(409)`. |
| S3 | 0010 L135 `property_rate_events` | It has no primary key and is cleaned up only probabilistically (2% of calls). That's fine at this scale. | Optional: a periodic cleanup job; the index already covers lookups. |
| S4 | 0010 L11-12 (comment) | `scan_assets.lng/lat` (0009) is still plaintext. This is already flagged as NDU-12. | Track it under NDU-12. |

## 2. Findings in the server logic (from the integration tests)

These are **real bugs**. Each one is pinned by a `todo` test: it runs and reports the problem, but does not fail CI, so it can be flipped to a normal test once fixed.

- **F2 (HIGH): about 13% of claims fail with a 500 error.**
  `buildMetadata` sets `name = "NDU item #" + record_ref.slice(0,6)`. `record_ref` is random hex. `validatePublicMetadata` (metadata.ts L186) rejects any `name` that contains `/\d{5,}/`. A 6-character hex prefix has a run of 5 or more digits with probability 0.625⁶ + 2·0.625⁵·0.375 ≈ **13.1%**, and in that case `submitClaim` throws a plain `Error("Refusing to publish metadata: long digit run in name")`, which surfaces as a 500. It is reproduced deterministically by the todo test "claims succeed whatever random record_ref was drawn".
  The same rule is why **4 of the other bot's own unit tests in `metadata.test.ts` fail right now**: the fixture `record_ref: "0123456789abcdef"` produces the name `NDU item #012345`. Result: `node --test src/lib/property/*.test.ts` gives 21 pass / 4 fail.
  *Fix (pick one):* (a) drop the ref from the name (`"NDU item"`); (b) exempt `name` when it matches `^NDU item #[0-9a-f]{6}$` (the ref is already public as `claim.record_ref`); or (c) generate `record_ref` so its first 6 characters never contain 5 digits. (a) or (b) is simplest. Option (b) keeps the digit sweep for every other field.
- **F1 (MEDIUM): the 3-items-per-scan cap can be bypassed by parallel requests.**
  `addItem` counts the scan's items and then inserts, with no lock. Six parallel `addItem` calls on one scan produced **6 items** in the test (cap is 3).
  *Fix:* in one transaction, `select id from scan_assets where id = $1 and user_id = $2 for update`, then count and insert. Alternatives are `pg_advisory_xact_lock(hashtext(scan_id))` or a trigger. `rateCheck` has the same count-then-insert pattern, which is less important.
- **Test-harness note (not a bug):** `src/world/scan-store.server.ts` imports the auth/session stack. Its PGLite Kysely dialect uses TypeScript parameter properties, which `node --experimental-strip-types` can't load. The tests therefore swap that one import for a tiny stub that has the same `scanRoot()` logic (`tests/property/stubs/`). Everything else under test is the real code.

## 3. Integration tests: `tests/property/property.integration.test.ts`

The tests run against the real scratch Postgres, with all migrations applied by `scripts/migrate.mjs`.
They use the project's runner, `node --test` with `--experimental-strip-types`, plus a small resolver hook for the `@/` alias (`tests/property/register.mjs`).

```
TEST_DATABASE_URL=postgres://qa@127.0.0.1:5440/citydesk_qa \
  node --experimental-strip-types --import ./tests/property/register.mjs --test 'tests/property/**/*.test.ts'
# tests 21 · pass 19 · fail 0 · todo 2 (F1, F2)   — 3 consecutive runs, identical
```

Coverage:
- **Feature switch:** off gives 404, no KEK gives 503, and the KEK value never echoes.
- **Consent (NDU-4):** an item or evidence without consent gives 412, and an old consent version doesn't count.
- **3-items cap (NDU-20):** the cap is enforced per scan and per owner, and other users get 404. Class, scope and group are validated. The race is the F1 todo.
- **Encrypted evidence (NDU-19/21):**
  - EXIF/GPS is stripped before hashing.
  - Files on disk are ciphertext with mode 0600 and opaque `<uuid>.bin` names.
  - The owner gets a byte-exact round trip, and a PDF is stored byte-identical.
  - A wrong KEK fails closed.
  - Family-group members can read, while outsiders and members who left get 404.
  - Replacing or withdrawing evidence shreds the file, the DEK and the salt, and deleting an item shreds everything.
- **Claim signature:**
  - The claim requires a wallet, a placed scan and both pieces of evidence.
  - These are rejected: an intruder key, an altered message, a garbage or empty signature, an expired or malformed `issuedAt`, and a room that moved after signing.
  - A valid claim gives `awaiting_mint` and locks the item.
- **Leak sweep (NDU-25/38):** the public metadata contains no label, user id, item, scan or group id, group name, evidence id or digest, lat/lng, geohash, or receipt text, and it passes `validatePublicMetadata`.
- **Verification card (NDU-30):** a fresh claim gives 1:unavailable, 2-6:pass, 7-8:unavailable. A draft item gives the expected unavailable states. Tampering is detected (metadata edit → 2 fails, receipt ciphertext → 4 fails, scan file → 6 fails), and withdrawn evidence shows 5 as withdrawn.
- **Mint stub OFF:**
  - The flag defaults to off, and the stub always returns 501.
  - Even with `PROPERTY_MINT_ENABLED=true`, records stay `awaiting_mint` with null `asset_id`/`tree`/`leaf_index`/`mint_sig`, and `mintEnabled` is false.
  - A source sweep of `property.server.ts` found no Keypair, secretKey, send/signTransaction, Metaplex or Umi code.
- **Groups (NDU-22):** names are stored wrapped, invite codes are stored hashed, and invites are member-only, single-use and expire after 72 h. Group creation is rate-limited to 5 a day, which returns 429.

Safety: the suite **refuses** any non-local DB, port 5436, or a DB name without `qa`/`test`/`ci`.
The KEK and the ed25519 wallets are generated in memory for each run and never written to disk or env files.
Evidence and scan files go to a temp dir that is deleted afterwards, and the suite deletes only its own rows.
When `property.server.ts` is not in the tree (as on this branch before the other bot commits) or `TEST_DATABASE_URL` is unset, the suite **skips** instead of failing.

## 4. Other checks on this worktree (baseline `e992e2b` + fixtures)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **clean** (exit 0) |
| `npx eslint tests` | **clean** |
| `npm run lint` (whole repo) | **red on baseline:** 7 errors (`prefer-const` in `src/game/TownshipScene.tsx` L47-50 and `src/game/sim.ts` L195-196; `no-empty` in `src/lib/app-data/client.server.ts` L281) plus 6 warnings. None are in QA files. |
| `npm test` | **red on baseline:** 184/197 pass. The 13 failures are template self-tests that assume auth is off or a stock app-env (`check-auth-invariant`, `migration-plan` "auth schema ships outside the globbed directory", `grok-pwa` og/title, `with-app-env`). This app ships auth on. These failures are not caused by this branch. |
| `node --test src/lib/property/*.test.ts` | 21/25 pass. The 4 failures come from F2 (other bot's files). |

CI (`.github/workflows/ci.yml`) runs everything above on a disposable `postgres:16-alpine` service and needs no secrets.
- **Blocking steps:** tsc, `eslint tests`, property unit tests, both migration dry runs (Postgres twice for idempotence, plus PGLite) and the integration suite.
- **Non-blocking steps:** whole-repo lint and `npm test`, marked `continue-on-error` with a note, until the baseline issues are fixed.
- **Expect red after merge:** once the other bot's files land, the property unit tests step will be red until F2 is fixed.
