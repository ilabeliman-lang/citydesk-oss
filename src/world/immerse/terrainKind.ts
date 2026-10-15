import type { Tier } from "@/world/perf/tier";

/** A: mesh plus shade. B: shade on a flat map. C: nothing, the map stays flat. */
export function terrainKind(tier: Tier): "full" | "shade" | "flat" {
  if (tier === "A") return "full";
  if (tier === "B") return "shade";
  return "flat";
}
