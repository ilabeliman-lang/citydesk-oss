// NDU-UPG placement: caller-owned pose snapshots. No module-level stack.

/** How many snapshots `push` keeps. At least 20 placement edits can be undone. */
export const UNDO_LIMIT = 20;

/** Copy `pose` onto the caller's stack, dropping the oldest past `limit`. */
export function push<T extends object>(stack: T[], pose: T, limit = UNDO_LIMIT): void {
  stack.push({ ...pose });
  if (stack.length > limit) stack.splice(0, stack.length - limit);
}

/** Pop the last snapshot. An empty stack is left untouched and returns null. */
export function undo<T>(stack: T[]): T | null {
  if (stack.length === 0) return null;
  const pose = stack.pop();
  return pose ?? null;
}
