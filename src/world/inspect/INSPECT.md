# Inspect any object (#04)

Long-press (about 450 ms) on a phone, right-click, Alt+click or `i` on a desktop opens a card for what's under the finger: a building, a simulated vehicle or walker, a place board, a street prop (once feature 03 registers `pickProp`), or later your own scan.

## Flags
- Client: `inspectAllowed()` in `flag.ts`. It's on in dev and off in production unless `VITE_NDU_INSPECT=on`. `?inspect=1` forces it on, `?inspect=0` forces it off, and localStorage `ndu.inspect.off=1` is the player's opt-out. Tap-first mode is `?inspect-tap=1` or `VITE_NDU_INSPECT_TAP=on`. The hold time is localStorage `ndu.inspect.hold` (300/450/700).
- Server: `inspectTags` answers `{ok:false, reason:"off"}` unless `INSPECT_ENABLED=true` (or dev). Without it the card still works from feature props alone.
- With the flag off there's no runtime chunk, no new listeners, no new requests, and the realism paint expression is unchanged.

## Files
| File | Role |
| --- | --- |
| `flag.ts` | flags (injectable env for tests) |
| `types.ts` | `InspectTarget`, `ObjectProfile`, `Field`, `Verb`, `PropRecordLike` (structural copy of 03's `PropRecord`) |
| `../render/materialCatalog.ts`, `../render/physicalMaterials.ts` | 24 materials (density, PBR colour, traits), OSM value map, tints, cached `MeshStandardMaterial` |
| `dates.ts` | OSM `start_date` grammar + age text |
| `tagPolicy.ts` | the public tag allow-list (shared by server and client) |
| `vehicleSpecs.ts`, `propPhysics.ts` | catalogue dims and mass (props keyed by main's types **and** 03's `PropKind`) |
| `profile.ts`, `unique.ts` | profile builders with per-field source + confidence; "stands out nearby" lines |
| `affordances.ts` | verbs, scored by need and distance; disabled verbs carry a reason |
| `gesture.ts` | long-press state machine (clock injected) |
| `pick.ts` | life → scan → building priority, ±6 px then ±22 px tolerance, dedupe, part choice |
| `store.ts` | the observable the sheet and runtime share |
| `tagCache.ts`, `tags.server.ts`, `tagsFn.ts`, `tags.ts` | server tag cache (filled by the realism Overpass cell fetch), rate limit 30/min, server fn, client LRU |
| `runtime.ts` | mounts the gesture, highlight, `i` hotkey, verbs; `attachMarkerInspect`; `setPropPicker` for feature 03 |
| `InspectSlot.tsx`, `InspectSheet.tsx`, `inspect.css` | lazy sheet: bottom sheet on phones, 360 px side card on desktop |

Integration points outside this folder: `CityBuildings.tsx` (lazy mount, swallow click, tap-first, place-board long-press, slot), `realism/index.ts` (`setInspectHighlight`, material tint), `realism/osmBuildings.ts` (`rememberCellTags`, `overpassJob`), `realism/buildingsData.ts` (`m`/`rm`/`y`, `cellStats`), `life/hooks.ts` + `life/index.ts` (`setLifeInspector`/`lifePickAt`), `hud/hotkeys.ts` (`onInspect`), `bag.tsx` (`addToBag`).

## Feature 03 (props) hook
03's plan exposes `pickProp(point): PropRecord | null`. Register it with `setPropPicker(pickProp)` from `@/world/inspect/runtime`. `propProfile(kind, record)` already reads 03's `PropRecord` shape (kind, dims, src, tree genus, tags).

## Privacy rules
- Public objects only ever show feature props, allow-listed OSM tags, catalogue data and derived quantities. Residential buildings drop the house number, operator and website. Contact, owner, phone, note and description are always dropped. Values are capped at 200 characters and 40 keys.
- Real people's sprites are never inspectable. Walkers and vehicles are simulated and have no identity or plate.
- Scans: a scan target can only come from the viewer's own `ScanMap`. The scan raycast (T20) isn't on this branch, so scans aren't pickable yet.
- Minting stays off. There's no wallet or key code, and the property link (T22/T23) isn't wired. `link_record` shows "Property records are off right now".

## Tests
`npm run test:inspect` (unit + privacy) and `tests/property/inspect.integration.test.ts` (PGLite, migration 0020).
