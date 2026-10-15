# Plan: OCR / document-ingest pipeline extract

- **Ticket:** heavy-a5 (Batch A of `handoff/HEAVY_BATCHES.md`, governed by
  `docs/adr/ADR-engine-extract.md`)
- **Date:** 2026-10-12
- **Acceptance:** Plan only — no code migrated.
- **Scope:** the document/receipt/image ingest pipeline (what the ticket calls
  "OCR pipeline" — see the naming note below).

## Naming note (verified, not assumed)

There is **no classical OCR (text extraction) anywhere in the codebase** — grep
for `ocr|tesseract|pdf-parse|extractText|textract` across `src/` and `scripts/`
returns nothing. What exists is a **safe-ingest pipeline for uploaded evidence
files** (receipts/photos: MIME sniff → metadata strip → NSFW/pHash/CSAM/plate
screening → envelope encryption → store). The "document-to-action-items" step is
a *user workflow* (a skill), not code. This plan therefore extracts the
**evidence-ingest pipeline**, which is the real "OCR pipeline" of this app. If
true text extraction is wanted later, it slots in as a new stage between
metadata-strip and screening (see "Where OCR would go").

## Current surface (all on main, file:line verified)

**The pipeline core — `src/lib/ingest/` (pure, isomorphic, no deps):**
- `ingest.server.ts:141` `ingestImage({bytes, userId, itemId, dir})` — the
  orchestrator: pHash dedupe + server NSFW, returns cleaned bytes or throws
  `IngestRejected` (`:58` `readIndex`, `:78` `rememberEvidence`,
  `:90` `forgetEvidence` are the pHash index helpers).
- `vision.ts` — pure pre/post-processing for the ONNX models: `NSFW_MODEL`
  (`:12`, Marqo/nsfw-image-detection-384, pinned by commit + SHA-256),
  `FACE_MODEL` (`:18`, UltraFace-RFB-320), thresholds `NSFW_BLOCK`/`NSFW_BORDERLINE`
  (`:29-31`). Both `cover()` crops and tensor builders are dependency-free.
- `phash.ts` — perceptual hashing (dedupe).
- `csam.ts`, `nsfw.server.ts` — Node-side screening sessions (opt-in).
- `scam.ts` + `scamCorpus.ts` — scam-signal screening.
- `plates.ts` (browser side, `src/world/ingest/plates.ts`) — licence-plate
  detection; `src/world/ingest/safePhoto.ts:200-214` `finishPhoto()` calls
  `plateBoxes(...)` at `:214` (the upg-u-090 integration point).

**The app coupling that must NOT come along:**
- `src/world/property.server.ts:524` `storeEvidence(sql, kek, userId, itemId,
  kind, raw)` — the app entry: consent check (`:534` `requireConsent`), rate
  limit (`:547` `rateCheck`), MIME allow-list (`:538-541`), `stripMetadata`
  (`:549`), then calls `ingestImage` (`:553`), `sha256Hex`, `sealBlob`
  (`:559`) and writes to `evidenceRoot()`.
- `src/world/property.server.ts:66-77` — `PROPERTY_KEK` loading / `requireReady()`;
  envelope crypto lives in `src/lib/property/envelope.server.ts` (`sealBlob`,
  `openBlob`, `loadKek` — imported at `:21`).
- `src/world/property.server.ts:593` `readEvidence()` — the decrypt-on-read path.
- `src/world/property-routes.server.ts:60` — the HTTP route that calls
  `storeEvidence`.
- `scripts/scan/` — the 3D-scan pipeline (GLB/USDZ), a *different* pipeline;
  explicitly out of scope for this extract.

## Proposed boundary

```
@citydesk/ingest            (the package)
  ├── phash.ts              pure — comes over unchanged
  ├── vision.ts             pure — comes over unchanged
  ├── csam.ts  nsfw.server.ts  scam.ts  scamCorpus.ts
  ├── plates detection      pure heuristic (upg-u-090 output)
  └── index.ts              ingestImage() + screenBytes() + PlateDetector
```

Stays in the app (CityDesk-specific): `storeEvidence`/`readEvidence`
(property.server.ts), envelope crypto (`property/envelope.server.ts` — the KEK
is app config), the HTTP route, consent/rate-limit checks, DB rows.

## Public API the package would export

```ts
import { ingestImage, screenBytes, detectPlates } from "@citydesk/ingest";

// pure screen: bytes in -> verdict out. No DB, no fs, no auth.
const verdict = await screenBytes(bytes, { models: "onnx-cpu" });
//   -> { ok: true, bytes: cleaned } | { ok: false, reject: "nsfw"|"csam"|"scam"|"duplicate", ... }

// the plate detector (pure RGBA in -> boxes out)
const plates = detectPlates(width, height, rgba);
```

`ingestImage` keeps its current shape but drops the `dir` phash-index argument
— the package takes an injected `PhashIndex` (an interface with
`read/remember/forget`) instead of a filesystem dir, so the app supplies its own
index impl. This is the one signature change; everything else moves verbatim.

## External dependencies and how they config

- **ONNX models** — self-hosted under `/models/ingest` (`vision.ts:18`,
  `src/world/ingest/models.ts`), pinned by commit + SHA-256. The package keeps
  the URL/SHA constants (already pure data) and takes a `modelsDir` option.
  No network fetch at runtime; a build step vendors them in.
- **No other runtime deps** — the pipeline is deliberately dependency-free
  ("pure pre/post-processing ... no deps", `vision.ts:1`). The package ships
  zero runtime dependencies, matching the ADR's testable-in-isolation goal.

## Migration steps

1. Create the package skeleton per heavy-a2's `tools/generate-all` contract
   (`@citydesk/ingest`, tsconfig, vitest/node:test config).
2. Move the `src/lib/ingest/*.ts` files verbatim; add `index.ts` re-exporting
   `ingestImage`, `screenBytes`, `detectPlates`, the model constants, and the
   `PhashIndex` interface.
3. Replace `ingestImage`'s `dir` parameter with an injected `PhashIndex`; the
   app passes an adapter over its current `evidenceRoot()` index files.
4. Update `src/world/property.server.ts:553` to import from `@citydesk/ingest`
   and pass the adapter. Behaviour is unchanged — this is a pure move.
5. Move the tests (`*.test.ts` beside each module) into the package; they are
   already pure and pass under `node --experimental-strip-types --test`.
6. Bump the app to depend on the workspace package.

## Risks

- **Phash index coupling (medium):** `ingestImage` reaches the filesystem via
  `dir`. The injected-`PhashIndex` change is the only behavioural seam; keep the
  old `dir`-based helper as a thin app-side adapter to avoid touching the scan
  paths.
- **ONNX vendor step (low):** models are self-hosted and pinned; the package
  must document the vendor step in its README or CI breaks on a fresh clone.
- **Envelope crypto is app-only (by design):** do NOT move
  `property/envelope.server.ts` into the package — the KEK is per-deployment
  config. The package screens bytes; the app encrypts them. Keeping this line
  clean is what makes the package safely leasable (heavy-a8).
- **Scan pipeline confusion (low):** `scripts/scan/` is unrelated (3D assets);
  keep it out of the package to avoid scope creep.

## Where OCR would go (if text extraction is ever wanted)

A new pure stage `extractText(bytes, mime)` between `stripMetadata`
(`property.server.ts:549`) and `ingestImage` (`:553`), inside the package,
returning `{ text, confidence }` that the app stores alongside the evidence row.
It would follow the same pattern: pure function, pinned model, no app coupling.

## Verdict

Feasible as a near-verbatim move of `src/lib/ingest/` (all pure, all already
tested) plus one small signature change (injected PhashIndex). Recommended
sequencing: after heavy-a2 (scaffold) and alongside heavy-a6 (canvas), since
both are low-coupling pure-module extracts. No live code touched by this plan.
