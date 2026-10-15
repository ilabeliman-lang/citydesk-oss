# src/world/props

This folder contains the procedural generation system for street furniture and vegetation props in the NDU CityDesk world. It handles the creation, specification, and mapping of various props used in the 3D environment.

- `props.test.ts`: Test file that validates prop specifications, OSM tag matching, night lighting behavior, and ensures each prop has valid needs.
- `proceduralKit.ts`: Contains functions to create procedural geometries for props including lamps, utility poles, standpipes, food stalls, benches, bus stops, and palm trees using Three.js primitives.
- `propsCatalogue.ts`: Defines the data structures and specifications for different prop types, including their names, physical dimensions, needs they serve, OSM tag mappings, and night lighting properties.