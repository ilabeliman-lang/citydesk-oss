# src/world/placement

This folder provides utilities for managing and manipulating pose placements in a geographic coordinate system. It includes functions for snapping poses to locations, calculating bearings, and handling undo operations.

- `snap.ts`: Exports functions for snapping a pose to a center point with an optional bearing, and calculating the longest edge bearing of a ring.
- `undo.ts`: Exports functions for managing undo stacks, including pushing snapshots and popping the last snapshot.
- `nudge.ts`: Exports types and functions for clamping poses, normalizing rotations, and offsetting poses by meters.