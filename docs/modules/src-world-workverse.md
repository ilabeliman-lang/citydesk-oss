# src/world/workverse

This folder implements the logic and state management for the Workverse environment. It coordinates agent behaviors, spatial navigation constraints, and a procedural audio system to create an immersive office atmosphere.

- `nav.ts`: Exports utility functions for checking walkability and clamping positions based on defined office obstacle bounding boxes.
- `audio.ts`: Provides a procedural Web Audio engine that synthesizes ambient drones, footsteps, key clicks, and chimes without external assets.
- `store.ts`: Defines a Zustand store that manages the global state of the workverse, including current floor, agent behaviors, and simulated terminal outputs.
