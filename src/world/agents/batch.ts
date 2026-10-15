/** Place one job. A video stays on a single idle GPU. A tile uses the chunk planner. */

import { planChunks } from "./chunks.ts";

export function planBatch(
  job: { kind: "tile" | "video"; bytes: number },
  units: { id: string; kind: "phone" | "cpu" | "iot" | "gpu"; maxChunkBytes: number; idle: boolean }[],
): { assignments: { unitId: string; bytes: number }[]; unassigned: number; reason: string } {
  if (job.kind === "tile") return planChunks(job, units);

  const bytes = Math.max(0, Math.floor(job.bytes));
  const gpu = units.find(
    (unit) => unit.kind === "gpu" && unit.idle && unit.maxChunkBytes > 0 && unit.maxChunkBytes >= bytes,
  );
  if (!gpu) {
    return { assignments: [], unassigned: bytes, reason: "The video waits for one GPU." };
  }
  return {
    assignments: [{ unitId: gpu.id, bytes }],
    unassigned: 0,
    reason: "One idle GPU holds the whole video.",
  };
}
