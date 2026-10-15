# CityDesk × Jarvis Verse — Features Roadmap & Handoff

> **Date:** 2026-10-09  
> **Status:** Active Execution  
> **Repository:** https://github.com/ilabeliman-lang/citydesk-oss.git  
> **Branch:** main  

---

## 1. Current State (Shipped & Live)

- **Default 3D Agent Office**: `src/studio/Office.tsx` automatically boots into the 3D Jarvis Verse on mount.
- **World Map Interior Portal**: Entering `Agent Office`, `Zealous Pane`, or `Office` on `src/world/WorldMap.tsx` opens the 3D interior.
- **Council Desks & Figures**: 8 council agents with animated typing/waving states, custom colors, task chairs, and felt partitions.
- **Interactive Camera Dive**: Clicking desk monitors smoothly zooms the camera into the screen and displays real-time telemetry logs.
- **Ada 3D Companion**: Follows player avatar using dynamic distance interpolation.
- **Spawn Pad & Elevator**: Gyroscope rings and elevator bay.

---

## 2. Next Features for Implementation

### Feature A: Floor 1 Coding Floor (Agentic IDE Panes)
- **Concept**: Separate floor layout dedicated to development panes and system pipelines (`ide-agentic`, `ide-vite`, `ide-db`, `ide-sim`, `ide-map`, `ide-audio`).
- **Aesthetic**: Violet night sky (`#0f0c1b`), cyan/magenta neon floor inlays, and dark terrazzo.
- **Components**:
  - `src/world/workverse/layout.ts`: Distinct desks and waypoints for `floorId === 1`.
  - Dynamic monitor content showing dev server status, database connections, and simulation ticks.

### Feature B: Audio & Soundscape Engine
- **Spatial Web Audio System**:
  - Ambient office room tone (subtle low-frequency air hum).
  - Mechanical keyboard typing chatter when near working agents.
  - Footstep audio synchronized with avatar walking/running velocity.
  - Elevator chime on floor transitions.
- **File Target**: `src/world/workverse/audio.ts`.

### Feature C: Interactive Elevator Multi-Floor Transitions
- **Floor Switcher Overlay**:
  - Floor 0: Council Office (8 desks)
  - Floor 1: Coding Floor (Agentic IDE & Mission Control)
  - Exit: Street Level (Return to Port Harcourt City Map)
- **Transition Animation**:
  - Fade-to-black with elevator bell chime, repositioning player at the elevator bay.

### Feature D: City Map "Zealous Pane" Landmark & Street Marker
- **Map POI**: Distinct gold/cyan beacon on the Port Harcourt digital twin map for the Zealous Pane headquarters.
- **Interaction**: Direct "Enter Building" card when tapped or walked into.

---

## 3. Parallel Execution Plan

| Bot / Agent | Target Surface | Responsibilities |
|---|---|---|
| **Subagent: CodingFloor** | `src/world/workverse/` | Floor 1 layout, coding desks, violet theme, dev monitor streams |
| **Subagent: Soundscape** | `src/world/workverse/audio.ts` | Synthesized spatial audio (typing, ambient hum, footsteps, chimes) |
| **Lead Agent (Coordination)** | `WorldMap.tsx`, `elevator`, review | Landmark POI on map, elevator transit overlay, QA & verification |
