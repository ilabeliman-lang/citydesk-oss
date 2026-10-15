/** Status moves open -> challenged -> settled. No database. */

export type DisputeStatus = "open" | "challenged" | "settled";

export type Dispute = {
  id: string;
  subjectId: string;
  status: DisputeStatus;
  openedAt: string;
};

export function openDispute(subjectId: string, id: string = crypto.randomUUID()): Dispute {
  const subject = subjectId.trim();
  if (!subject) throw new Error("A dispute needs a subject.");
  return {
    id,
    subjectId: subject,
    status: "open",
    openedAt: new Date().toISOString(),
  };
}

export function challenge(dispute: Dispute): Dispute {
  if (dispute.status !== "open") {
    throw new Error(`Cannot challenge a dispute that is ${dispute.status}.`);
  }
  return { ...dispute, status: "challenged" };
}

export function settle(dispute: Dispute): Dispute {
  if (dispute.status === "open") {
    throw new Error("Cannot settle a dispute that is still open.");
  }
  if (dispute.status !== "challenged") {
    throw new Error(`Cannot settle a dispute that is ${dispute.status}.`);
  }
  return { ...dispute, status: "settled" };
}
