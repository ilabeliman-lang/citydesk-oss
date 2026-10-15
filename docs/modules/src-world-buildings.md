# src/world/buildings

This folder handles building realism and city data, specifically focusing on height resolution, roof types, and building quality. It provides utilities to translate OSM tags and geographic context into 3D building specifications.

- `index.ts`: The main entry point that exports the height resolver, roof types, and building quality modules.
- `roofTypes.ts`: Contains logic for normalizing roof shapes, detecting geographic regions, and resolving roof materials and colours.
- `buildings.test.ts`: Provides comprehensive unit and integrated tests for height resolution, roof specifications, and building quality assessments.
