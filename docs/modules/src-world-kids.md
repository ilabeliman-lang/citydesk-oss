# src/world/kids

This folder implements the "Kids room," a low-poly 3D environment built with three.js for interactive play. It includes the scene construction, entry mechanisms, and a parental access gate.

- `gate.ts`: Exports logic for generating and validating multiplication-based math questions for the parent gate.
- `door.tsx`: Provides the `KidsDoor` button and `KidsHost` portal to manage entry into and exit from the room.
- `scene.ts`: Contains the core three.js implementation of the living room environment, including lighting, models, and interactive animations.
