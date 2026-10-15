# src/game

This folder manages the core simulation state and game logic for the player's life simulation. It handles player needs, movement, interactions, and persistence via local storage.

- `ageOk.ts`: Exports functions to read and write age attestation markers to local storage.
- `copy.ts`: Exports a constant containing the text strings used for game dialogue and notifications.
- `sim.ts`: Exports the primary simulation state, need decay logic, and functions for handling player movement and interactions.
