# src/world/life

This folder implements the street-level life simulation, managing the movement and behavior of walkers and vehicles. It also handles the UI and logic for interacting with agents and environmental props.

- `sim.ts`: Manages the core simulation loop, agent spawning, movement, and role-based dialogue.
- `card.ts`: Implements the `BubbleCard` UI for displaying agent information and dialogue bubbles.
- `ride.ts`: Handles vehicle hailing, fare calculation, and interaction with street props like benches and stalls.
