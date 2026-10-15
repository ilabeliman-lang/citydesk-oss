# Scan pipeline (NDU-UPG #351-#357, #360, #366-#369, #371, #373, #378-#381, #389, #391, #393, #395, #398, #400)

Upload -> `scan-store.server.ts` sniffs bytes (+ zip guard for USDZ) and stores the raw file ->
a `scan_jobs` row -> `pipeline.mjs` in a child process: USDZ->GLB (`usdz_to_glb.py`), Khronos
glTF-Validator (report kept as `<id>.report.json`), gltf-transform dedup/prune/weld/simplify-to-budget,
origin to footprint centre on the floor, WebP <= 1024 px textures, meshopt -> `<id>.opt.<sha12>.glb`.
`GET /api/scans/:id` serves the optimised GLB once ready (`?raw=1` = original, `?report=1` = validator report).

- Tools (CPU, no root): `scripts/scan/setup-tools.sh` -> `../.ndu-scan-tools/venv` (usd-core TOST-1.0, usd2gltf MIT). Override with `SCAN_PYTHON`.
- Runner: inline in the web server by default (one job at a time, child process, timeout, 3 attempts).
  `SCAN_WORKER=external` + `pm2 start scripts/scan/worker.mjs --name citydesk-scan-worker` (needs `DATABASE_URL`) moves it out.
- Presets/budgets: `presets.json`. Tests: `node --test scripts/scan/pipeline.test.mjs` (golden fixture `fixtures/smoke-room.glb`).
- E2E against a preview: `BASE_URL=http://127.0.0.1:8085 node scripts/scan/e2e-preview.mjs mobile|desktop`.
- NDU-AI safe ingest #3 (`cleanup.mjs`): cm/mm/inch exports rescaled to metres (`SCAN_AUTO_UNITS`, on), degenerate
  triangles dropped, floaters removed (`SCAN_DENOISE`, off), Draco instead of meshopt (`SCAN_COMPRESS=draco`). Tests: `cleanup.test.mjs`.
