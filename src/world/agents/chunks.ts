/** Split a job across idle units. A unit only receives a chunk it can finish. */

export type UnitKind = "phone" | "cpu" | "iot" | "gpu";
export type JobKind = "tile" | "video";

export type UnitOffer = {
  id: string;
  kind: UnitKind;
  maxChunkBytes: number;
  idle: boolean;
};

export type ChunkPlan = {
  assignments: { unitId: string; bytes: number }[];
  unassigned: number;
  reason: string;
};

const ALLOWS: Record<UnitKind, readonly JobKind[]> = {
  phone: ["tile"],
  iot: ["tile"],
  cpu: ["tile"],
  gpu: ["tile", "video"],
};

/** What this class is allowed to hold. The server clamps to these on enroll. */
export const CHUNK_CAP: Record<UnitKind, number> = {
  phone: 64 * 1024,
  iot: 16 * 1024,
  cpu: 1024 * 1024,
  gpu: 8 * 1024 * 1024,
};

export function planChunks(job: { kind: JobKind; bytes: number }, units: UnitOffer[]): ChunkPlan {
  const bytes = Math.max(0, Math.floor(job.bytes));
  const idle = units.filter(
    (unit) => unit.idle && unit.maxChunkBytes > 0 && ALLOWS[unit.kind].includes(job.kind),
  );
  idle.sort((a, b) => b.maxChunkBytes - a.maxChunkBytes);
  let left = bytes;
  const assignments: { unitId: string; bytes: number }[] = [];
  for (const unit of idle) {
    if (left <= 0) break;
    const take = Math.min(left, unit.maxChunkBytes);
    assignments.push({ unitId: unit.id, bytes: take });
    left -= take;
  }
  const reason =
    idle.length === 0
      ? "No idle unit can take this job."
      : left > 0
        ? "The idle units could not hold the whole job."
        : assignments.length === 1
          ? "One idle unit can hold it."
          : "Split across idle units. The merge uses the chunk order, not which device it was.";
  return { assignments, unassigned: left, reason };
}
