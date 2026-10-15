/**
 * Compare a card hash with the expected hash.
 * No signature is made and nothing is sent over the network.
 * The chain is not consulted.
 */

export type CardVerify = {
  status: "matched" | "unmatched";
  chain: "unavailable";
};

/** Same hash is "matched". The chain check stays "unavailable". */
export function verifyCard({ hash, expected }: { hash: string; expected: string }): CardVerify {
  return {
    status: hash === expected ? "matched" : "unmatched",
    chain: "unavailable",
  };
}
