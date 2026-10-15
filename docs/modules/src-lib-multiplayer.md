# src/lib/multiplayer

This folder implements peer-to-peer networking functionality using WebRTC for direct browser-to-browser communication in multiplayer scenarios.

- `p2p.ts` exports the `P2PRoom` class for managing WebRTC connections between peers, along with utility functions and interfaces for signaling, connection state management, and data channel handling.
- `index.ts` re-exports all types and the `P2PRoom` class from the p2p module, providing a clean public API for multiplayer functionality.