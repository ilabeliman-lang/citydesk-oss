# 02 · Terrain and ground clamping: research (78 references)

Prepared Oct 10, 2026 (HST) for CityDesk/NDU (`$CITYDESK_HOME`, MapLibre GL JS 5.6.1, three.js 0.186.1).
Each entry gives a link and one line on **what to borrow**. Entries marked ✅ were checked by web search for this report. The rest are stable, well-known project or documentation pages.

Facts checked in our own installed `node_modules/maplibre-gl@5.6.1` (dist build) are listed at the end. They matter more than any outside reference.

---

## A. DEM data, encodings and tile sources

| # | Reference | What to borrow |
|---|---|---|
| 1 | ✅ AWS Terrain Tiles (Registry of Open Data): https://registry.opendata.aws/terrain-tiles/ | This is our current source (`immerse/terrain.ts:16`). Free with no key. There is an EU replica bucket `elevation-tiles-prod-eu` we can use as a fallback mirror. |
| 2 | ✅ Tilezen joerd `formats.md`: https://github.com/tilezen/joerd/blob/master/docs/formats.md | Exact Terrarium decode `(R*256 + G + B/256) - 32768`, giving 1/256 m resolution. We need it for our own CPU sampler, so ground truth doesn't depend on MapLibre's loaded tiles. |
| 3 | Tilezen joerd attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md | The attribution string we already ship. Keep it when we add mirrors. |
| 4 | ✅ FME "Terrain Tiles on AWS" reader: https://docs.safe.com/fme/html/FME-Form-Documentation/FME-ReadersWriters/terraintilesaws/terraintilesaws.htm | Source mix: 3DEP 10 m (3 m in places) in the US (so Honolulu is good), SRTM 30 m elsewhere (Lagos, Port Harcourt), and ETOPO1 for the sea. Expect very different quality per city. |
| 5 | ✅ Mapbox Terrain-DEM v1: https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/ | The `mapbox` encoding `-10000 + (R*65536 + G*256 + B)*0.1`. Our decoder should take an `encoding` switch so a provider swap is a config change. |
| 6 | ✅ Mapbox Terrain-RGB v1: https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1 | 0.1 m quantisation note. Unit tests should round-trip both encodings. |
| 7 | ✅ Mapbox "Access elevation data": https://docs.mapbox.com/data/tilesets/guides/access-elevation-data | The pattern: fetch a DEM PNG, draw it to a canvas, read pixels and decode. We do the same in a worker with `createImageBitmap` + `OffscreenCanvas`. |
| 8 | ✅ Copernicus DEM on AWS: https://registry.opendata.aws/copernicus-dem/ | GLO-30 is a **DSM** (it includes buildings and trees). Don't swap it in blindly for street-level clamping in dense cities. |
| 9 | ✅ Copernicus GLO-30 licence (PDF): https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf | The public GLO-30 release allows reproduction and adaptation, but newer CCM terms are stricter. Needs a licence review (Wei) before we self-host derived tiles commercially. |
| 10 | ✅ FABDEM V1-2 (Univ. Bristol): https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn | A true bare-earth 30 m DTM with buildings and forest removed, which is ideal for Lagos and Port Harcourt. But it is **CC BY-NC-SA**, so use it only for dev or with a Fathom commercial licence. |
| 11 | NASADEM (LP DAAC): https://lpdaac.usgs.gov/products/nasadem_hgtv001/ | ✅ CC0/public domain. It is the re-processed SRTM with fewer voids, so it is the legally safest global upgrade if we self-host tiles. |
| 12 | SRTM at USGS EROS: https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1 | 30 m C-band radar. It partly sees canopy and roofs, so expect bumps of +2 to 8 m in dense blocks. This is why we smooth (PLAN §5.7). |
| 13 | ✅ JAXA ALOS AW3D30: https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm | Free commercial use with a ©JAXA credit. An alternative 30 m source where SRTM has voids. |
| 14 | USGS 3D Elevation Program: https://www.usgs.gov/3d-elevation-program | The bare-earth lidar behind the US part of the AWS tiles. It explains why Honolulu clamps well and Lagos less so. |
| 15 | ✅ NOAA/USGS 2022–23 Oahu lidar DEM (0.5 m bare earth): https://www.fisheries.noaa.gov/inport/item/75971 | A path to **sub-metre** ground for Honolulu: build our own Terrarium z17 tiles for the demo wards (it captures kerbs, stairs and Punchbowl slopes). |
| 16 | ✅ Mapterhorn: https://mapterhorn.com/ · https://protomaps.com/blog/mapterhorn-terrain/ | An open Terrarium WebP 512 px tile set plus a planet PMTiles. It is the best modern fallback or mirror. Can `pmtiles extract` a city bbox and self-host it (check the licence per source). |
| 17 | OpenTopography: https://opentopography.org/ | One place to fetch lidar and global DEMs for the build pipeline (§9, P4). |
| 18 | mapbox/rio-rgbify: https://github.com/mapbox/rio-rgbify | A CLI to turn a GeoTIFF DTM into RGB DEM tiles, used for the self-hosted Oahu and Lagos tile build. |
| 19 | PMTiles: https://github.com/protomaps/PMTiles | A single-file, range-request tile archive. Self-host the DEM next to the planned ward PMTiles (#52/#94) with no S3 dependency. |
| 20 | GDAL `gdaldem` / `gdal2tiles`: https://gdal.org/programs/gdaldem.html | Slope and roughness rasters for relief gating, plus an offline QA comparison of our decoder against GDAL. |

## B. MapLibre / Mapbox engine behaviour

| # | Reference | What to borrow |
|---|---|---|
| 21 | ✅ MapLibre "3D Terrain" example: https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/ | The canonical `raster-dem` + `setTerrain` + sky setup we already use on Tier A. |
| 22 | ✅ MapLibre "Adding 3D models using three.js on terrain": https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/ | **The exact fix for `scanLayer.ts:143`.** Use `queryTerrainElevation()` and pass it to `MercatorCoordinate.fromLngLat(ll, elevation)`. A model at altitude 0 sits at sea level, so it is buried on any hill. |
| 23 | ✅ maplibre-gl-js PR #3854: https://github.com/maplibre/maplibre-gl-js/pull/3854 | Since this PR `queryTerrainElevation` returns metres **above sea level**, and custom layers get a "lowered" matrix. So absolute altitudes in `mainMatrix` are correct in v5. |
| 24 | ✅ maplibre-gl-js issue #3427: https://github.com/maplibre/maplibre-gl-js/issues/3427 | Explains the old "relative to centre elevation" confusion. It is the reason our code must never mix pre-v4 snippets. |
| 25 | ✅ MapLibre `MarkerOptions` (`opacityWhenCovered`): https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MarkerOptions/ | DOM markers already sit on terrain, but they fade to **0.2** when the terrain "covers" them. On slopes the avatar's own feet can trigger this, so set it per marker. |
| 26 | MapLibre style spec, terrain: https://maplibre.org/maplibre-style-spec/terrain/ | `exaggeration` must stay at 1 for real metres. Every height we compute must also multiply by it, because `getElevation` does. |
| 27 | MapLibre `Map` API (`queryTerrainElevation`, `setCenterElevation`, `setCenterClampedToGround`): https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/ | v5 camera `elevation` and `setCenterClampedToGround(false)` let the follow camera ride a bridge deck instead of the valley floor. |
| 28 | ✅ maplibre-contour (onthegomap): https://github.com/onthegomap/maplibre-contour | A worker-side DEM tile fetch, decode and cache pipeline with LRU. It is the best open-source template for our `HeightCache`. |
| 29 | ✅ MapLibre "Add contour lines": https://www.maplibre.org/maplibre-gl-js/docs/examples/add-contour-lines/ | An optional 5 m contour overlay on Tier B so hills read on a flat map. |
| 30 | Mapbox GL JS "Add 3D terrain": https://docs.mapbox.com/mapbox-gl-js/example/add-terrain/ | Mapbox's `fill-extrusion` on terrain uses the same centroid convention: a building floor is the DEM at its centroid. We match it for scans. |
| 31 | ✅ Mapbox style spec `sources` (raster-dem): https://docs.mapbox.com/style-spec/reference/sources/ | `tileSize`, `maxzoom` and `encoding` semantics. MapLibre overscales a z14 DEM for z18+ views, so the DEM pixel is ~9 m. |
| 32 | ✅ deck.gl TerrainExtension: https://deck.gl/docs/api-reference/extensions/terrain-extension | Two modes: `drape` for lines and polygons, `offset` for points and icons. Use the same split: decals drape, agents get an offset. |
| 33 | deck.gl TerrainLayer: https://deck.gl/docs/api-reference/geo-layers/terrain-layer | Meshing DEM tiles in a worker with MARTINI. Useful if we ever need a CPU terrain mesh for raycasts. |
| 34 | ✅ mapbox/martini (RTIN): https://github.com/mapbox/martini | Error-bounded terrain meshes. Option for a three.js "ground catcher" mesh under scans, for contact shadows on slopes. |
| 35 | mapbox/delatin: https://github.com/mapbox/delatin | Delaunay terrain meshing, with fewer triangles than MARTINI for the same error. |
| 36 | Agafonkin, "MARTINI: real-time RTIN terrain mesh": https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh | A clear explanation of the error metric. Lets us choose a 0.25 m tolerance for a ground-contact mesh. |

## C. Globe engines and photoreal tiles

| # | Reference | What to borrow |
|---|---|---|
| 37 | Cesium World Terrain: https://cesium.com/platform/cesium-ion/content/cesium-world-terrain/ | A global quantized-mesh terrain with bathymetry. It is the benchmark for "ground truth" quality, but needs an ion token and licence. |
| 38 | ✅ Cesium `HeightReference`: https://cesium.com/learn/cesiumjs/ref-doc/global.html | Borrow the vocabulary: `CLAMP_TO_GROUND`, `RELATIVE_TO_GROUND`, `CLAMP_TO_TERRAIN` and `NONE`. Our `AltMode` type mirrors it. |
| 39 | ✅ Cesium `sampleTerrainMostDetailed`: https://cesium.com/downloads/cesiumjs/releases/1.67/Build/Documentation/sampleTerrainMostDetailed.html | An async "most detailed" sample, separate from what is currently rendered. Same split as our `heightAt` (DEM) against `anchorAt` (drawn). |
| 40 | ✅ Cesium PR #7115 (clamp to 3D Tiles most detailed): https://github.com/CesiumGS/cesium/pull/7115 | Load the leaf tiles off-screen and then clamp, so the result doesn't change with camera distance. This is our reason for a fixed-zoom (z14) CPU sampler. |
| 41 | ✅ Cesium PR #11604 (3D Tiles height reference): https://github.com/CesiumGS/cesium/pull/11604 | "Ground" means max(terrain, tiles). Future rule when photoreal tiles land: clamp to the higher surface. |
| 42 | ✅ Cesium forum, sampleHeight instability: https://community.cesium.com/t/how-to-get-the-altitude-of-3d-models-directly-under-the-given-coordinates/22254 | Height sampled from rendered geometry changes with the camera. Never persist a height read from the render. |
| 43 | quantized-mesh spec: https://github.com/CesiumGS/quantized-mesh | Edge-skirt and normals extension ideas, useful if we later stream our own TIN for bridges. |
| 44 | ✅ Google Photorealistic 3D Tiles: https://developers.google.com/maps/documentation/tile/3d-tiles | The photoreal surface would make the DEM irrelevant near the camera. Kept behind the existing "photoreal option" gap (#11). |
| 45 | ✅ Google Map Tiles API policies: https://developers.google.com/maps/documentation/tile/policies | No caching or extracting heights from Google tiles, and no derived models. So we can't bake a ground profile from them, only render-time clamp. |
| 46 | NASA-AMMOS 3DTilesRendererJS: https://github.com/NASA-AMMOS/3DTilesRendererJS | A three.js 3D Tiles renderer with raycast support. It is the most likely route to photoreal plus clamping in our three.js layers. |
| 47 | ArcGIS JS `ElevationLayer.queryElevation`: https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-ElevationLayer.html | The batch "query elevation of a polyline with demResolution" API. Borrow the polyline densification and resolution parameters for our graph baking. |

## D. Games, engines, raycast and heightfield techniques

| # | Reference | What to borrow |
|---|---|---|
| 48 | ✅ MSFS 2024 SDK, "Using the SDK" (terrain tiers): https://docs.flightsimulator.com/msfs2024/retail/introduction/using-the-sdk/ | A three-tier ground: photogrammetry, then DEM + aerial, then DEM + synthetic textures. It matches our A/B/C tiers, each with a single ground authority. |
| 49 | ✅ Asobo, "Designing a terrain system" (GDC pdf): https://www.asobostudio.com/files/inline-images/Designing_Terrain_System_Fuentes_Lionel.pdf | Quadtree streaming of DEM with roads, water and footprints **flattening** the terrain. Borrow the "roads and building pads flatten the DEM" idea. |
| 50 | ✅ TechCrunch on Blackshark.ai and MSFS: https://techcrunch.com/2020/08/17/meet-the-startup-that-helped-microsoft-build-the-world-of-flight-simulator/ | Procedural world from footprints plus DEM at planet scale. It confirms the OSM + DEM approach is production-viable. |
| 51 | ✅ FiveM native `GET_GROUND_Z_FOR_3D_COORD` (GTA V): https://github.com/citizenfx/natives/blob/master/MISC/GetGroundZFor_3dCoord.md | GTA's ground query only works when geometry is streamed in, and returns `found=false` otherwise. Our API must return `{h, ok}`, never a silent 0 (our current `groundElevation` returns 0). |
| 52 | ✅ Cfx forum, "Can't reliably get ground Z": https://forum.cfx.re/t/cant-reliably-get-the-ground-z-position/4819979 | The standard workaround is to retry after the region streams in. Same as our re-clamp when a DEM tile arrives. |
| 53 | ✅ Cyberpunk 2077 modding wiki, Foot Snap IK: https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/animations/removing-foot-snap-ik-from-poses-animations | AAA characters snap feet to slopes and stairs at runtime, turned off per pose. For our low-poly walkers a pelvis-only clamp is enough. |
| 54 | ✅ Vulkan docs, foot placement on uneven terrain: https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Procedural_Animation_IK/04_foot_placement.html | Raycast per foot, smooth heights and normals, and drop the pelvis by the largest foot drop. A future upgrade for the avatar figure. |
| 55 | ✅ Unity `TerrainData.GetInterpolatedHeight`: https://docs.unity3d.com/6000.7/Documentation/ScriptReference/TerrainData.GetInterpolatedHeight.html | Bilinear sampling on a normalised heightmap. Same maths as our `sampleBilinear`. |
| 56 | ✅ Unity Character Controller, slope management: https://docs.unity3d.com/Packages/com.unity.charactercontroller@1.0/manual/slope-management.html | Slope limit plus "don't ground on a sharp downward break". Use it for avatar free-walk off the graph. |
| 57 | ✅ Animancer, uneven ground IK sample: https://kybernetik.com.au/animancer/docs/samples/ik/uneven-ground/ | IK weight curves. Blend the clamp in over 150 ms so a re-clamp never pops. |
| 58 | ✅ Unreal `CharacterMovementComponent` (FindFloor, MaxStepHeight, WalkableFloorAngle): https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/CharacterMovementComponent | Default max step 45 cm and a walkable-angle threshold. Use them for stairs and kerbs, and to stop an avatar walking off a bridge deck. |
| 59 | Unreal Landscape (outdoor terrain): https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-outdoor-terrain-in-unreal-engine | Heightmap components plus "landscape splines" that deform terrain under roads. The same "flatten under roads" idea as #49. |
| 60 | ✅ GDC Vault, "Down with Nav Meshes": https://www.gdcvault.com/play/1027984/AI-Summit-Down-with-Nav | Navigation data that carries height and layer per cell. Supports baking height onto our walk and drive graph edges instead of sampling per frame. |
| 61 | Recast & Detour: https://github.com/recastnavigation/recastnavigation | The navmesh "climb height" and "detail mesh" ideas: store a coarse height per polygon, plus a detail sample for steps. |
| 62 | Rapier, heightfield collider: https://rapier.rs/docs/user_guides/javascript/colliders#heightfield | If we add physics for the collision gap (audit #1), feed it the same decoded DEM grid, so physics and render ground agree. |
| 63 | ✅ three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh | Fast `firstHitOnly` raycasts. Use it for the GLB scan "contact plane" (lowest support points) and later for walking on scanned floors. |
| 64 | Tevs et al., "Maximum mipmaps for height-field rendering" (2008): https://dl.acm.org/doi/10.1145/1342250.1342279 | Min/max mip pyramids make ray against heightfield queries O(log n). Keep a per-tile min/max for relief gating and picking. |
| 65 | Inigo Quilez, terrain raymarching: https://iquilezles.org/articles/terrainmarching/ | Adaptive step ray marching against a heightfield. Our tap-to-ground picking fallback when MapLibre `unproject` is ambiguous on cliffs. |
| 66 | cannon-es `RaycastVehicle`: https://pmndrs.github.io/cannon-es/docs/classes/RaycastVehicle.html | Four wheel rays give pitch and roll. Our cheap version samples DEM at four wheel contact points (PLAN §5.5). |

## E. Bridges, tunnels, layers and stairs (OSM and open source)

| # | Reference | What to borrow |
|---|---|---|
| 67 | ✅ OSM wiki `Key:layer`: https://wiki.openstreetmap.org/wiki/Key:layer | `layer` is **relative ordering, not height**. Use it only to decide which way is on top at a crossing, then solve the height from the abutments. |
| 68 | ✅ OSM wiki `Key:bridge`: https://wiki.openstreetmap.org/wiki/Key:bridge | `bridge=yes/viaduct/boardwalk/movable` and the usual `layer=1`. The deck must not follow the DEM of the valley under it. |
| 69 | OSM wiki `Key:tunnel`: https://wiki.openstreetmap.org/wiki/Key:tunnel | `tunnel=yes/building_passage/culvert`. A building passage is at ground level (don't hide), but a real tunnel is below the DEM (hide or ghost). |
| 70 | OSM wiki `Key:incline`: https://wiki.openstreetmap.org/wiki/Key:incline | Direction and grade hints on steps and ramps. Use them as a sanity check on the solved profile. |
| 71 | OSM wiki `Key:ele`: https://wiki.openstreetmap.org/wiki/Key:ele | Surveyed node elevations (peaks, stations, some bridges) as hard constraints in the profile solver when present. |
| 72 | OSM wiki `Tag:highway=steps`: https://wiki.openstreetmap.org/wiki/Tag:highway%3Dsteps | `step_count` and `incline`. Rise ≈ step_count × 0.17 m when the DEM is too coarse to see the stair. |
| 73 | OSM wiki `Key:level`: https://wiki.openstreetmap.org/wiki/Key:level | Indoor and multi-storey levels. `tiles.ts:60` already drops `level` ways. Keep that and document it. |
| 74 | OSM wiki `Tag:man_made=bridge`: https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dbridge | A bridge outline polygon gives the deck width and extent, for drawing our own deck ribbon on Tier A. |
| 75 | ✅ OpenMapTiles `transportation` schema: https://openmaptiles.org/docs/schema/ · https://github.com/openmaptiles/openmaptiles/blob/master/layers/transportation/transportation.yaml | The vector tiles we already read carry `brunnel` (bridge/tunnel/ford) and `layer`. No extra network is needed for bridge detection. |
| 76 | Simple 3D Buildings: https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings | `min_height` and `building:min_level` are relative to the ground at the footprint. They stay relative, with `heightResolver.ts` unchanged. |
| 77 | ✅ Streets GL (StrandedKitty): https://github.com/StrandedKitty/streets-gl | An open-source WebGL2 OSM city with terrain, roads and bridges. Study how it raises bridge ribbons above draped terrain. Its community notes bridges over roads still need `layer` handling. |
| 78 | OSM2World: https://osm2world.org/ · https://github.com/tordanik/OSM2World | The most complete open OSM-to-3D generator for bridges, tunnels, steps and terrain. Borrow its "elevation calculation" constraint approach (connectors, clearance, grade). |

---

## Facts checked in our own code (installed `maplibre-gl@5.6.1`)
- `Map.queryTerrainElevation()` returns **`null` when there is no terrain** (Tier B and C), and otherwise `terrain.getElevationForLngLatZoom(ll, transform.tileZoom)`, which is `getDEMElevation × exaggeration`. While a DEM tile is still loading, MapLibre uses a **flat empty DEM**, so you get `0` with no "not loaded" signal. Our `groundElevation()` (`immerse/terrain.ts:112`) turns both cases into `0`. That causes the "sinks, then pops" problem.
- `fill-extrusion` on terrain (`TERRAIN3D` shader) lifts every building by the DEM at **`a_centroid`**, and pushes the base down **10 m** when `base == 0`. So building floors equal the DEM at the centroid, and walls dig into slopes. Our scans and props should use the same convention.
- The terrain mesh is `meshSize = 128` per render tile. At z18 that is about 1.2 m spacing, so DEM bilinear sampling matches the drawn surface to within centimetres near the camera.
- Markers use `locationToScreenPoint(ll, terrain)`, so **every DOM marker (avatar, Tier C walkers, shop boards) is already on terrain on Tier A**. The default `opacityWhenCovered` is `0.2`.
- The camera has `_elevateCameraIfInsideTerrain`, `centerClampedToGround`, `setCenterElevation()` and `CameraOptions.elevation`. All are available for the bridge-deck camera.
- The OpenFreeMap Liberty style (our basemap) has 20 `bridge_*` and 20 `tunnel_*` layers, so we can hide the draped bridge lines on Tier A when we draw real decks.
