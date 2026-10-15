# NDU realism pass — lighting & building constants (NDU-UPG #50, #34)

All lit things read ONE sun (`state.ts` → `sun.ts`): MapLibre `setLight` (anchor `map`), sky/fog,
extrusion tint, and the three.js scan lights (`scanLook.ts`). Change numbers here and in `sun.ts`
`LIGHT` / `palette()` only.

| Constant | Where | Value | Effect |
|---|---|---|---|
| Key light | `keyLight()` | sun if alt > −4°, else moon if up > 5°, else 55° dome | direction for map + scans |
| Map light position | `mapLight()` | `[1.15, azimuth, 90 − altitude]` (polar clamped 0–88) | extrusion shading |
| Map light intensity | `palette().mapIntensity` | 0.30 dawn → 0.50 day; night 0.18 + 0.15 × moon | contrast of lit/shaded faces |
| Sun colour | `LIGHT.noon/golden/dusk/moon` | #fffaf0 / #ffd6a5 / #96a0d7 / #96afe6 | light tint |
| Building base colour | `LIGHT.building*` | day #ded6c8, golden #e8d6c0, night #484e66 | `fill-extrusion-color` (± hash variation 0.90–1.06) |
| Roof cap | `index.ts` | building × 0.72, or OSM `roof:colour` | 0.35 m slab (tier A all, tier B tagged; all at night) |
| Night ground dim | `index.ts` | #0b1030 × 0.6 × night | fill under extrusions |
| Windows | `windowImage()` | 3 code-drawn 16×32 sprites, on when night > 0.6 | `fill-extrusion-pattern` (tier A/B) |
| Sky / horizon / fog | `LIGHT.sky*/horizon*` | blended by sun altitude | `map.setSky` |
| three.js sun | `palette().sunIntensity` | 0.6 → 2.4 day; 0.15–0.5 night | DirectionalLight |
| three.js hemisphere | `palette().hemi*` | 0.45 → 1.6 | fill so shaded scan sides aren't black |
| Exposure | `palette().exposure` | 1.25 night → 1.0 day | ACES `toneMappingExposure` |
| Level height | `heights.ts LEVEL_M` | 3.0 m | levels → metres |
| Roof allowance | `roofAllowance()` | roof:height, else roof:levels × 2.25, else 1.5 pitched / 0.6 flat | added to levels height |
| Priors | `TYPE_PRIORS`, `LANDUSE_PRIORS` | e.g. residential 2 lv, commercial 3, industrial 1 × 7 m | untagged buildings |

## Render order (#34)
basemap fills → `ndu-night-dim` → `building-3d` (tile, twins hidden by id) → `ndu-real-buildings`
→ `ndu-real-roofs` → `ndu-scans` (three.js custom layer, resetState before+after) → labels → HTML markers.

## Data sources
1. Overpass cell (server, cached 24 h, 1 request in flight, back-off on 429/504): real tags, types,
   colours, building:parts. Interim until ward PMTiles are baked (#52/#94).
2. Fallback, no network: basemap `building` tiles — only `render_height` 0 (OSM height=0) or the
   untagged 5 m default are re-heighted with landuse priors; tagged heights are left alone.
Attribution: `© OpenStreetMap contributors (ODbL)` on the derived source. No Google content.
