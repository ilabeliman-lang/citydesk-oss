/**
 * Mock NeuraNet node. Status is read-only and mint stays off.
 * No network. No keys.
 */

export type NodeStatus = {
  mode: "mock";
  mint: false;
  readOnly: true;
};

/** Mock node status. Mint is false and the node is read-only. */
export function nodeStatus(): NodeStatus {
  return { mode: "mock", mint: false, readOnly: true };
}

/** Mint is blocked. This throws and sends nothing. */
export function dispatch(..._args: unknown[]): never {
  throw new Error("mint is blocked");
}
