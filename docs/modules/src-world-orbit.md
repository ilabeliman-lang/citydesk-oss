# src/world/orbit

This folder manages the camera systems for the map world, including automated player following and different perspective rigs. It coordinates the transition between street-level views and various overview modes.

- `follow.ts`: Implements a Google-Maps-style follow camera that tracks the player avatar with smoothing and heading-up logic.
- `viewBus.ts`: Provides a state management system to get, set, and cycle through different camera view modes.
- `viewRig.ts`: Contains mathematical calculations for camera positioning, zoom, and pitch for various modes, as well as walking bob and sway effects.
