/** NDU realism 02: shared ground types (pure, no imports). See docs/realism/02-terrain-ground/PLAN.md §4.1. */
export type GroundMode = "off" | "flat" | "terrain3d";
export type Encoding = "terrarium" | "mapbox";
export type HeightSample = { h: number; ok: boolean; src: "map" | "dem" | "flat" | "last" };
/** Cesium-style vocabulary. */
export type AltMode = "ground" | "relative" | "absolute";
export type DemTile = { z: number; x: number; y: number; size: number; h: Float32Array; min: number; max: number };
export type DeckKind = "ground" | "bridge" | "tunnel" | "steps" | "passage";
export type EdgeZ = { deck: DeckKind; layer: number; za: number; zb: number; zs?: Float32Array; stepM?: number };
export type Normal = { nx: number; ny: number; nz: number; slopeDeg: number };
export type Spot = { lng: number; lat: number };

export type GroundStats = {
  mode: GroundMode;
  version: number;
  tiles: number;
  inflight: number;
  failures: number;
  bakeMs: number;
  scans: { id: string; baseZ: number; targetZ: number; err: number }[];
};

/** What the rest of the map sees (through ground/hooks.ts). */
export type GroundHandle = {
  mode: () => GroundMode;
  version: () => number;
  heightAt: (lng: number, lat: number) => HeightSample;
  anchorAt: (lng: number, lat: number) => HeightSample;
  clusterZ: (anchor: Spot, pts: Spot[]) => Float32Array;
  normalAt: (lng: number, lat: number) => Normal | null;
  subscribe: (fn: () => void) => () => void;
  onPlayerSpot: (spot: Spot) => void;
  playerDeckZ: () => number | null;
  reportScan: (s: { id: string; baseZ: number; targetZ: number; err: number }) => void;
  /** Prefetch DEM around a spot (placed scans). */
  want: (s: Spot) => void;
  noteBake: (ms: number) => void;
  stats: () => GroundStats;
};
