# Render Layer Order Contract (NDU-UPG Item 34)

In accordance with NDU Rendering Pipeline architecture, rendering strictly adheres to the layer order below to prevent z-fighting and texture corruption between MapLibre GL and Three.js custom layer passes:

1. **Basemap Fills (`basemap-fills`)**
   - Background polygons, landuse, water bodies.
2. **Roads & Transport (`roads`)**
   - Surface highways, streets, sidewalks, and unpaved laterite tracks.
3. **Building Extrusions (`3d-buildings`)**
   - True-meter extruded OSM polygonal building footprints with sun-altitude responsive shading.
4. **Three.js Custom Layer Scans (`three-scans-and-props`)**
   - Three.js custom layer containing scanned rooms, procedural street furniture (lamps, poles, stands), and animated avatars. State isolation maintained with `renderer.resetState()`.
5. **Map Labels & POI Symbols (`poi-labels`)**
   - MapLibre curved road names and POI icons above 3D geometry.
6. **HTML / DOM Markers (`html-markers`)**
   - Embossed interactive badges, tooltips, and modal cards.
