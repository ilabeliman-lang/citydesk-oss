# Comprehensive Architecture: CityDesk Isometric Building Verse

> **Subject:** Refactoring the Agent Office into the Jarvis Verse & Generalizing Jarvis Verse as the Universal Isometric Template for All CityDesk Buildings  
> **Reference:** [Personal Jarvis Verse Launch (Oct 1, 2026)](https://personaljarvis.ai/blog/jarvis-verse/)  
> **Target System:** CityDesk Digital Twin (Port Harcourt / Lagos)  

---

## Executive Summary

Personal Jarvis 2.4 introduced **Jarvis Verse**: a walkable 3D spatial office replacing flat agent lists with living characters at desks, live terminal monitors, procedural states (working, waiting, idle, paused), dedicated rooms (Spawn Pad, Lead Office, Team Room, Break Room with arcade, Wardrobe), and an upper **Coding Floor / Mission Control** connecting live agent sessions.

CityDesk features a macro-scale 3D digital twin of Port Harcourt with thousands of real-world OpenStreetMap (OSM) extruded buildings, vehicle physics, and pedestrian dynamics.

This blueprint establishes how to:
1. **Completely retire and replace the 2D Agent Office** with the full Jarvis Verse experience.
2. **Elevate Jarvis Verse into a Universal Procedural Interior Engine** for *all* buildings in CityDesk.
3. **Lock the interior isometrically to each building's real-world geometry and street bearing** (`35.26°` isometric elevation, matching OSM polygon footprint boundaries).

---

## 1. Deconstructing Jarvis Verse (`personaljarvis.ai/blog/jarvis-verse/`)

| Core System | Jarvis Verse Specification | CityDesk Mapping |
|---|---|---|
| **Roster Representation** | Figures at desks in department clusters instead of flat lists. | Council members & coding processes rendered as interactive 3D chibi figures. |
| **Agent Behaviors** | `working` (typing at desk, pulsing glow), `waiting` (waving), `idle` (coffee, couch, bookshelf, arcade), `paused` (couch nap). | Zero-token deterministic animation state machine driving figures throughout the day. |
| **Monitors & Terminals** | Read-only canvas text streams on desk monitors. Clicking dives camera into interactive terminal session. | Real-time terminal feeds with camera-dive modal (`pane:citydesk:<id>`) executing commands and inspecting telemetry. |
| **Specialized Rooms** | - **Spawn Point**: Gyroscope rings where newly hired agents arrive.<br>- **Lead Suite**: Walnut & brass corner suite for lead coordinator.<br>- **Team Room**: Conference table for multi-agent meetings.<br>- **Break Room**: Couches, espresso bar, water cooler, Asteroid Run retro arcade cabinet.<br>- **Office Dog**: AI pet roaming between rooms, follows when petted. | Built into the ground floor layout with Lagos/sandcrete architectural styling. |
| **Floor 1: Coding Floor** | Elevator transit to upper deck. Agentic IDE panes become characters with live streaming shells; Mission Control wide matrix display. | Mission control for dev server, database WASM, simulation engine, and map tile streamer. |

---

## 2. The Architectural Leap: The Isometric Building Verse Engine

In standard Jarvis Verse, the office floats in an infinite void. In CityDesk, **every building has a physical address, a polygon footprint, a height, and an orientation relative to the avenue**.

```
                ┌───────────────────────────────────────────────┐
                │          CITYDESK 3D STREET (MAPLIBRE)        │
                │  OSM Building Extrusion (Lat/Lng, Bearing θ)  │
                └──────────────────────┬────────────────────────┘
                                       │ Tap or Walk Into Door
                                       ▼
                ┌───────────────────────────────────────────────┐
                │       ISOMETRIC BUILDING VERSE (R3F)          │
                │  - Floor Slab clipped to OSM Footprint Poly   │
                │  - Camera Pitch: 54.74° (True Isometric)      │
                │  - Camera Yaw: Rotated to Building Bearing θ  │
                │  - Procedural Interior Layout by Building Tag │
                └──────────────────────┬────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
│ COMMERCIAL/OFFICE │        │  RETAIL & SHOPS   │        │ RESIDENTIAL/FLATS │
│ Executive Suite,  │        │ Sales Counters,   │        │ Lounge Inlays,    │
│ Desk Rows, Canvas │        │ Inventory Screens,│        │ Bedroom Suites,   │
│ Telemetry Screens │        │ Shopkeeper Figure │        │ Balcony Railings  │
└───────────────────┘        └───────────────────┘        └───────────────────┘
```

### 2.1 The True Isometric Contract
CityDesk's empty-state engine (`src/world/empty-state/isoScene.ts`) defines the exact mathematical isometric projection:
```typescript
const ISO_ELEV = Math.atan(1 / Math.SQRT2); // 35.264° true isometric elevation
export const ISO_PITCH = 90 - (ISO_ELEV * 180) / Math.PI; // 54.736° pitch
```
When a player enters a building:
1. **Footprint Clipping**: The R3F floor slab geometry is extruded directly from the building's OSM polygon rings (`THREE.Shape(poly[0])`).
2. **Street Bearing Alignment**: The orthographic/isometric camera yaw matches `spot.bearing` from the map, ensuring the facade faces forward exactly as it did from the street outside.
3. **Cross-Section Cutaway**: The front walls are cut away or rendered as low glass partitions (`1.1m`), giving an unobstructed isometric view into all rooms.

---

## 3. Universal Interior Generation Pipeline

### 3.1 Taxonomy of Building Templates
Depending on OpenStreetMap tags (`amenity`, `shop`, `office`, `building`), the engine dynamically instantiates the appropriate room topology:

```typescript
export type BuildingArchetype =
  | "flagship_verse" // Zealous Pane HQ (2-floor full Jarvis Verse)
  | "corporate_office" // Commercial offices & bank branches
  | "retail_market" // Shops, pharmacies, kiosks, food stalls
  | "civic_assembly" // Government, community centers, halls
  | "residential"; // Apartments, villas, guest houses
```

#### A. Flagship Verse (`flagship_verse` - Zealous Pane HQ)
* **Floor 0**: Council Floor (8 desks, lead suite, reception, break room, gyroscope spawn pad, companion).
* **Floor 1**: Coding Floor & Mission Control (IDE terminal panes, wide screen wall).

#### B. Corporate Office (`corporate_office`)
* Procedural desk benches scaled to footprint area (`floorAreaM2 / 20m²`).
* Reception desk at building entrance coordinates.
* Desk monitors displaying commercial voucher transactions and ledger blocks.
* Resident business manager figure seated at the desk.

#### C. Retail & Street Marketplace (`retail_market`)
* Counter units and display shelves.
* Cashier/trader figure with waving interaction.
* Monitor showing inventory, price catalog, and opening hours.

#### D. Residential Suites (`residential`)
* Modular sofa, low table, kitchenette, bed, and decorative potted plants.
* Resident figures resting or strolling.

---

## 4. Implementation Blueprint: Step-by-Step Refactor

```
src/world/
├── workverse/                    # Core Jarvis Verse 3D Engine
│   ├── WorkverseScene.tsx        # Top-level R3F Scene (camera, sky, light)
│   ├── WorkverseIsometricRig.tsx # NEW: True Isometric Camera Rig with bearing lock
│   ├── WorkverseRooms.tsx        # Procedural room shells & footprint-bound slabs
│   ├── WorkverseFurniture.tsx    # Furniture kit (desks, counters, couches, shelves)
│   ├── WorkverseAgents.tsx       # Seated & roaming figures with state machines
│   ├── WorkversePlayer.tsx       # Isometric WASD player controller with A* nav
│   ├── WorkverseMonitors.tsx     # CanvasTexture live screen generator
│   ├── WorkverseElevator.tsx     # Multi-floor elevator transition system
│   ├── ToyFigure.tsx             # Procedural chibi avatar
│   ├── audio.ts                  # Procedural Web Audio soundscape
│   ├── layout.ts                 # Floor plan builder (roster + footprint sizing)
│   └── store.ts                  # Zustand state store
└── empty-state/
    └── InsideView.tsx            # Upgraded to mount the Isometric Workverse
```

### Step 1: Upgrading `WorkverseCamera` to True Isometric Rig
Replace standard perspective follow camera with an isometric rig supporting:
- Pitch fixed at `54.74°` (or customizable between `15°` and `75°`).
- Yaw initialized to `building.bearing`.
- Zoom levels scaled to bounding box dimensions (`Math.max(width, depth)`).
- Smooth keyboard/drag orbit rotation.

### Step 2: Footprint-Bounded Floor Slabs
In `WorkverseRooms.tsx`:
- Take `shape.polys` from the building feature.
- Generate `THREE.ExtrudeGeometry` with `depth: 0.15` and bevel for the floor slab.
- Distribute desks and furniture only inside polygon bounds using point-in-polygon (`insidePoly(pt, poly)`).

### Step 3: Unifying Building Entry in `WorldMap.tsx`
Replace the legacy conditional fallback in `WorldMap.tsx`:
```tsx
// Universal interior portal: ALL buildings enter the Isometric Workverse
{inside ? (
  <WorkverseSlot
    spot={inside}
    onLeave={() => setInside(null)}
  />
) : null}
```

---

## 5. Summary of Benefits

1. **Complete Convergence**: The 2D agent office card grid is eliminated; the entire application uses a cohesive, high-fidelity spatial representation.
2. **Infinite Reusability**: Every building in Lagos and Port Harcourt becomes immediately walkable with zero manual 3D modeling required.
3. **True Spatial Continuity**: Because the interior is locked to the building's street bearing, stepping in and out feels like walking through a real doorway.
4. **Zero Token Overhead**: Agent states, walking physics, keyboard typing, and coffee breaks run 100% client-side in WebGL/Web Audio.
