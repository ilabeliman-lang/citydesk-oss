/**
 * CSAM match against a vendor hash list.
 * There is no list on this machine. This does not download one, call a vendor,
 * or read a file of known hashes. The check stays unavailable.
 */
export function csamCheck(_bytes: Uint8Array) {
  return { status: "unavailable" as const, reason: "no vendor list" };
}
