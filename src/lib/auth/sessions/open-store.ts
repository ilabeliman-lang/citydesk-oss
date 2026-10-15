/** NDU-UPG sessions: tiny open/close store so the ⋯ menu opens the (lazy-loaded) sessions sheet. */
import { useSyncExternalStore } from "react";

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function openSessionsSheet() {
  open = true;
  emit();
}
export function closeSessionsSheet() {
  open = false;
  emit();
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
export function useSessionsSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
