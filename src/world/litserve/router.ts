/** Pure LitServe job map. Chat goes to ada. A scan goes to scans. Anything else is null. No network. */

export function routeJob(kind: string): "ada" | "scans" | null {
  if (kind === "chat") return "ada";
  if (kind === "scan") return "scans";
  return null;
}
