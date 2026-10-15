# src/world/hud

This folder implements the Heads-Up Display (HUD) for the 3D world, including UI elements like embossed tokens and need summary chips.

- `embossTokens.ts`: Defines design tokens for embossed UI elements and utilities for CSS generation and haptic feedback.
- `needsChips.ts`: Evaluates player needs and determines urgent actions based on need levels.
- `hotkeys.ts`: Manages global hotkey bindings for HUD and camera controls.
- `hud.test.ts`: Contains tests for the embossTokens, needs evaluation, and hotkey functionality.