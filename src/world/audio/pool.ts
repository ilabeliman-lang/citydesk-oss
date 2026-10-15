/**
 * NDU-FP (FPXR-15 / upg-u-074): a bounded free-list of reusable Web Audio nodes.
 *
 * Pure bookkeeping — no DOM, no AudioContext — so the cap logic is unit-testable
 * in plain node. An `AudioBufferSourceNode` is one-shot (it cannot be restarted),
 * so this pools the *reusable* chain nodes (gains, panners); the expensive part,
 * the rendered sample `AudioBuffer`s, is rendered once per surface/voice and
 * cached by the footstep bank in `./footstepBank.ts`.
 */

export interface NodePool<T> {
  /** An idle node from the free list when one exists, otherwise a fresh `factory()` node. */
  acquire(factory: () => T): T;
  /**
   * Return an idle node. Past `cap` idle nodes the node is dropped, so the free
   * list never grows unbounded — only concurrent in-flight voices are kept.
   */
  release(node: T): void;
  /** Nodes built by `factory` so far. Stops growing once the pool warms up. */
  readonly created: number;
  /** Nodes currently idle, waiting to be reused. Never exceeds `cap`. */
  readonly idle: number;
}

/** Create a free-list pool that keeps at most `cap` idle nodes. */
export function createNodePool<T>(cap: number): NodePool<T> {
  const free: T[] = [];
  let created = 0;
  return {
    acquire(factory) {
      const idle = free.pop();
      if (idle !== undefined) return idle;
      created += 1;
      return factory();
    },
    release(node) {
      if (free.length >= cap) return;
      free.push(node);
    },
    get created() {
      return created;
    },
    get idle() {
      return free.length;
    },
  };
}
