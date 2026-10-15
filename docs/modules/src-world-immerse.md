# src/world/immerse

This module manages environmental immersion effects for the 3D city map, including terrain, water, and atmosphere. It coordinates visual effects like rain, fog, and lighting based on the device performance tier and realism settings.

- `flag.ts`: Exports constants and functions to check if immersion effects are allowed and enabled via build environment, URL parameters, or local storage.
- `atmos.ts`: Implements atmospheric overlays including a rain canvas, fog, clouds, stars, and lightning flashes.
- `index.ts`: Provides the main `mountImmerse` function to initialize and synchronize the various immersion components (terrain, ground, and atmosphere) with the map state.
