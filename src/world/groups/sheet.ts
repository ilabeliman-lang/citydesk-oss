/** An in-memory group sheet. No database and no property server. */

export type GroupRole = "owner" | "member";

export type GroupMember = {
  userId: string;
  role: GroupRole;
};

export type Group = {
  name: string;
  ownerId: string;
  members: GroupMember[];
};

function cleanName(value: string): string {
  return String(value ?? "").trim();
}

/** Opens a group. The name is trimmed. An empty name throws. The owner is a member. */
export function createGroup(name: string, ownerId: string): Group {
  const trimmed = cleanName(name);
  if (!trimmed) throw new Error("Give the group a name.");
  const owner = cleanName(ownerId);
  if (!owner) throw new Error("A group needs an owner.");
  return {
    name: trimmed,
    ownerId: owner,
    members: [{ userId: owner, role: "owner" }],
  };
}

/**
 * Adds a person to the sheet. A user already on it, including the owner, is not added twice.
 * Returns the same group.
 */
export function addMember(group: Group, userId: string): Group {
  const id = cleanName(userId);
  if (!id) throw new Error("A member needs a user id.");
  if (group.members.some((member) => member.userId === id)) return group;
  group.members.push({ userId: id, role: id === group.ownerId ? "owner" : "member" });
  return group;
}
