# src/world/empty-state

This folder handles the rendering of empty-state 3D views for buildings and places. It provides isometric rendering, shape conversion from map features, and UI components for managing building overrides.

- `isoScene.ts`: Provides an isometric renderer for empty-state buildings with support for owner overrides and GLB models.
- `footprint.ts`: Converts map features and place pins into local-metre 3D shapes for isometric rendering.
- `InsideView.tsx`: Renders the inside view of a building with UI controls for managing overrides and items.