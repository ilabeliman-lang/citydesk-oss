# NDU immersion: terrain, water, sky, weather, sound (`src/world/immerse/`)

Mounted from `CityBuildings.tsx` after the style loads (own lazy chunk, like realism). It reads the
device tier from perf (`getTier()` / `onTier()`) and the sun, place and time from realism
(`getRealism()` / `subscribeRealism()`). The live weather tints realism's palette through one hook,
`setPaletteFilter` in `realism/state.ts`, so the map light, sky, fog and the three.js scans all share it.

| File                                    | What                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `weather.ts`                            | Pure model: WMO codes, Open-Meteo parsing, effects (rain/cloud/fog/wet/wind), palette tint, particle budget, sound levels. Tested in `immerse.test.ts`. |
| `weatherFn.ts`                          | Server function: Open-Meteo proxy, cached 15 min per ~11 km cell (0.1°), in-flight de-dupe, 2 min failure cool-down.                                    |
| `store.ts`                              | Client store: follows realism's place, localStorage first paint, overrides, forecast preview, battery saver, Effects switch.                            |
| `terrain.ts`                            | Tier A 3D terrain + hillshade; Tier B hillshade only; Tier C none; silent flat fallback. `groundElevation()` for scans/avatar.                          |
| `ground.ts`                             | Water shimmer + shoreline foam, grass/sand textures z16+, laterite unpaved roads, gutters, wet ground, drifting cloud shadows.                          |
| `atmos.ts`                              | 2D overlays (no second WebGL context): rain + splashes, fog veil, overcast dim, sky-band clouds/stars, lightning, rainbow.                              |
| `sound.ts`                              | Procedural Web Audio soundscape (city, rain, wind, birds, night crickets, thunder, Sunday bells). Off by default.                                       |
| `ImmerseBubble.tsx` / `ImmerseSlot.tsx` | The one weather + sound bubble (Bubble system from PR #7 inside the compass cluster; classic pill in `?ui=classic`).                                    |

## Switches

- `?immerse=0` or `VITE_NDU_IMMERSE=off`: nothing loads. The bubble's "effects" switch turns it off live and is remembered (`ndu.immerse.off`).
- `?weather=clear|cloudy|rain|storm|fog|haze` for demos and screenshots; `?tier=A|B|C` from perf.
- Particles are off on Tier C, with prefers-reduced-motion, with battery saver (manual or under 20% and not charging), and with data saver.

## Licences and data

- **Weather:** [Open-Meteo](https://open-meteo.com/), data CC BY 4.0, credited in the bubble. The free API is for **non-commercial use**; commercial use needs their paid API plan, so this needs Wei's decision before any paid launch.
- **Terrain:** AWS Terrain Tiles (Terrarium) from the AWS Registry of Open Data. Free, no key. Attribution is in the map: Mapzen/Tilezen, SRTM, USGS, ETOPO1 and others ([attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)).
- **Textures and sound:** all procedural (generated in code). No asset files, nothing to license.
