# NDU street life (src/world/life)

Walkers, kekes, danfos, buses and cars on the real OSM street graph around the view, plus true-scale
road widths. Part of the immersion batch (`upg/immerse-life`), items from NDU_1000_UPGRADES.md
categories 5 (roads/traffic) and 6 (people/crowds).

| File | What |
| --- | --- |
| `hooks.ts` | the only static import from CityBuildings (tap, player spot, old sprite roster); no three.js |
| `index.ts` | `mountLife(map)`: own chunk, data + sim + picking + bubble card; lazy-loads the layer |
| `lifeLayer.ts` | one MapLibre custom layer on the map's WebGL context (no 2nd canvas); 7 draw calls |
| `models.ts` | procedural low-poly people + vehicles (vertex colours, no textures, no faces) |
| `sim.ts` | walkers on sidewalks/footways; vehicles on directed lanes, IDM at 5 Hz, bus stops, signals |
| `graph.ts` | street graph in local metres, oneway, lane offsets (right-hand traffic), seeded RNG |
| `density.ts` | tier caps, time-of-day + weekday density, POI pull, liveries, skin/outfit palettes |
| `parse.ts`, `streets.ts` | Overpass query + parser, 30 min server cache per ~110 m cell |
| `roadWidths.ts` | #201 road widths in metres from z16 (never thinner than the style) |
| `card.ts` | embossed bubble card for a tapped walker/vehicle |

Tiers: A up to 72 walkers / 40 vehicles at every frame; B 28 / 20 at ~30 fps; C none (the old DOM
sprites are cut to 4 walking dots + 1 hawker). Degrade-ladder rung 4 halves the crowd. Reduced motion:
the street is populated but stands still and the card does not animate.

Kill switch: `?life=0` or `localStorage["ndu.life.off"] = "1"`. QA: `?tier=A|B`, `window.__nduLife` (dev).

## Licences

- Models: procedural, generated in code in this repo (`models.ts`), no third-party meshes, textures,
  animation clips or Mixamo data. Same licence as the repo; free of attribution needs (CC0-compatible).
- Data: (c) OpenStreetMap contributors, ODbL (roads, footways, bus stops, signals, POIs) — the map's
  attribution control already credits OSM.
- People are made-up, faceless and adults-only; cards say "not a real person". No photo-to-avatar (#256 stays OFF).

## Tap card and frame budget

- **Card fits the bubble UI** (`src/world/bubbles`): in bubbles mode a tap pops a small embossed name bubble over the agent (name plate ≤ 12 chars). Tap it to unfold the talk card; tap again to fold it. `?ui=classic` shows the card straight away. It closes with × or Escape, by tapping elsewhere, or after 9 s folded (16 s unfolded). It honours reduced motion.
- **Frame budget** (`index.ts` tick): the crowd counts real frames each second. When the page drops below 45 fps (or 25), it animates less often, down to one frame every 4 s, then creeps back once things are smooth. In a headless swiftshader Tier B run the degrade ladder stays at step 0 with the crowd on.
