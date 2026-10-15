/** NDU-UPG sessions: small time labels for the sheet and desk (client-safe). */
export function ago(isoTime: string | null | undefined, now = Date.now()): string {
  if (!isoTime) return "unknown";
  const s = Math.max(0, Math.round((now - new Date(isoTime).getTime()) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function when(isoTime: string | null | undefined): string {
  if (!isoTime) return "unknown";
  return new Date(isoTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
