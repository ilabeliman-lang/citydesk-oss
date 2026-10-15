# NDU-AI safe ingest (track A)

Branch `ai/safe-ingest`. Items from `NDU_AIML_UPGRADES.md`: #3/#121/#146 (on-device NSFW + faces), #19/#129/#134 (EXIF/GPS/PII strip + perceptual-hash dedupe), #9/#33 (scan auto-cleanup), #13/#126/#127-lite (scam / impersonation check).

Everything runs on the phone (onnxruntime-web, wasm) or on the existing Node server's CPU. No GPU, no paid API, no new machine, **no DB migration**.

## What happens to a photo

| Step                                                                                                                                                                  | Where  | Flag (default)                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------- |
| Read what metadata it carries, for the "Removed: …" chips                                                                                                             | phone  | `stripMeta` (ON)                |
| Decode with EXIF orientation applied, cap at 2048 px                                                                                                                  | phone  | —                               |
| NSFW gate: block only clear cases (P ≥ 0.85); borderline passes with a note; if the model can't load (old phone, offline, Save-Data) the photo is allowed with a note | phone  | `nsfwGate` (ON)                 |
| Face detection; every face is pre-selected for an irreversible mosaic, tap a face to keep it sharp                                                                    | phone  | `faceBlur` (ON)                 |
| Re-encode through a canvas (no EXIF), byte-strip again, fit the size budget                                                                                           | phone  | `stripMeta` (ON)                |
| Deep strip again: EXIF/GPS, XMP, IPTC, comments, MPF + images appended after EOI, PNG text/eXIf/tIME, WebP EXIF/XMP. Only the orientation tag is written back         | server | `INGEST_STRIP_META` (on)        |
| pHash (64-bit DCT) vs. earlier evidence. Same item: fine. Your own photo on another item: notice. Someone else's: review log line + notice                            | server | `INGEST_DEDUPE` (on)            |
| Refuse someone else's photo instead of flagging it                                                                                                                    | server | `INGEST_DEDUPE_BLOCK` (**off**) |
| Re-run the NSFW model on CPU (needs `INGEST_NSFW_MODEL_PATH` = the pinned file; never downloads)                                                                      | server | `INGEST_NSFW_SERVER` (**off**)  |

QA overrides on a phone: `?ingest-nsfw-gate=off`, `?ingest-face-blur=off`, … (remembered on that phone).

The pHash index is `<PROPERTY_EVIDENCE_DIR>/.ingest/phash.jsonl` (0600): hash, evidence id, item id, user id, time. Shredding evidence or deleting an item removes its lines.

## Listings and claims (scam / impersonation)

`src/lib/ingest/scam.ts`: explainable rules (lookalike domains — homoglyphs, typos, brand-in-someone-else's-host, punycode; brand impersonation; guaranteed/daily returns; pay-first / gift cards / crypto / "release fee"; seed phrase / OTP requests; urgency; off-platform contact as a weak signal) plus a tiny Naive Bayes trained at load from `scamCorpus.ts` (written for this repo). Output is `ok | review | high` with plain-words reasons; `autoBan` is always false.

- Writers see a gentle note under the business register form and the My room claim form (lazy, never blocks).
- Managers see a ⚑ chip per listing on `/admin`, computed from the stored text on read (no column).
- `INGEST_SCAM_FLAG` (on) turns it all off; `INGEST_SCAM_HOLD` (**off**) opens "high" listings closed until a manager opens them.

## Scans (`scripts/scan/cleanup.mjs`)

Already in the pipeline: weld, simplify to the preset budget, origin on the floor, meshopt. Added: centimetre / millimetre / inch exports are rescaled to metres instead of refused (`SCAN_AUTO_UNITS`, on), degenerate triangles dropped (always), floater islands removed (`SCAN_DENOISE`, **off**), Draco as an alternative to meshopt (`SCAN_COMPRESS=draco`, default meshopt; the map loader reads both). The result JSON gains `stats.cleanup`.

## Models and licences

| Model                                                                                                                      | Use        | Licence      | Size                         | Where                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Marqo/nsfw-image-detection-384](https://huggingface.co/Marqo/nsfw-image-detection-384) (ViT-tiny, timm)                   | NSFW gate  | Apache-2.0   | 22.5 MB                      | Hugging Face, pinned to commit `b2d8f0c3` + SHA-256 `7b81155…d26d`, cached in the browser; `VITE_INGEST_NSFW_MODEL_URL` to self-host the same bytes |
| [UltraFace version-RFB-320](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB) (ONNX Model Zoo export) | face boxes | MIT          | 1.2 MB                       | `public/models/ingest/ultraface320.onnx`, SHA-256 `34cd7e6…8017`                                                                                    |
| onnxruntime-web 1.30                                                                                                       | runtime    | MIT          | 70 kB JS + 14 MB wasm (lazy) | npm                                                                                                                                                 |
| pHash, scam rules, Naive Bayes                                                                                             | —          | written here | —                            | —                                                                                                                                                   |

Not used, on purpose: NudeNet (repo AGPL-3.0, YOLOv8 base AGPL) and SCRFD/InsightFace (non-commercial weights).
Note: UltraFace was trained on WIDER FACE (a research dataset); the weights themselves are MIT.

## Tests

`npm run test:ingest` (CI step "Safe ingest tests"): strip (JPEG incl. progressive/MPF/trailing, PNG, WebP), pHash robustness, NSFW/face pre/post-processing and the gate, scam rules + classifier, flags, server ingest with real sharp JPEGs, scan cleanup (units, degenerate, floaters, Draco). The server NSFW test runs only when `INGEST_NSFW_MODEL_PATH` is set.
