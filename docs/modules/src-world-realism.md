# src/world/realism

This module handles the environmental lighting and realism for the 3D city map. It calculates sun and moon positions to derive lighting palettes and manages the synchronization of these effects across the map and 3D scans.

- `sun.ts`: Provides functions for calculating sun/moon positions, compass bearings, and generating color palettes for different times of day.
- `state.ts`: Manages the shared realism state, including the current location, time overrides, and a subscription system for lighting updates.
- `index.ts`: Integrates realism into the map by managing 3D building extrusions, sky colors, night-time window patterns, and WebGL context loss handling.
