# src/world/perf

This folder manages the application's performance scaling and hardware detection. It implements a tiered quality system that dynamically adjusts graphical settings based on device capabilities and real-time frame rates.

- `tier.ts`: Detects and manages the device performance tier (A, B, or C) using hardware heuristics and session overrides.
- `ladder.ts`: Implements a degradation ladder that drops specific graphical features one by one when performance targets are not met.
- `hud.ts`: Provides a QA performance HUD that displays real-time metrics such as FPS, frame times, draw calls, and web vitals.
