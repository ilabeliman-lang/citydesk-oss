/** Sharing consent. Null and false stay off. Remote execution is never turned on. */

export function shareConsent(choice: boolean | null): { on: boolean; remoteExec: false } {
  if (choice === true) return { on: true, remoteExec: false };
  return { on: false, remoteExec: false };
}
