/** Who may see a record. The owner always can. Everyone else only when it is public. */

export type RecordVisibility = "private" | "public";

export type VisibleRecord = {
  ownerId: string;
  visibility: RecordVisibility;
};

/** Owner always sees. A stranger sees a record only when its visibility is public. */
export function canSee(viewerId: string, record: VisibleRecord): boolean {
  if (viewerId === record.ownerId) return true;
  return record.visibility === "public";
}
