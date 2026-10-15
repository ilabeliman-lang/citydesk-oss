/**
 * Crypto-shred plan: forget the key, keep the ciphertext.
 * This module holds no key and deletes nothing.
 */

export type ShredPlan = {
  recordId: string;
  action: "forget-key";
  keepsCiphertext: true;
};

/** A delete control that names the record and drops the key. Empty ids throw. */
export function shredPlan(recordId: string): ShredPlan {
  if (typeof recordId !== "string" || recordId.trim() === "") {
    throw new Error("empty record id");
  }
  return {
    recordId,
    action: "forget-key",
    keepsCiphertext: true,
  };
}
