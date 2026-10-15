/** NDU-AI avatar-bot assistant: forgiving name matching for "find X" / "fly to X" (pure). */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|near|nearby|closest|nearest|please)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 0..1: exact > prefix > contains > token overlap. */
export function score(query: string, name: string): number {
  const q = norm(query);
  const n = norm(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.startsWith(q)) return 0.9;
  if (n.includes(q)) return 0.8;
  if (q.includes(n) && n.length >= 4) return 0.7;
  const qt = q.split(" ").filter((w) => w.length > 2);
  const nt = new Set(n.split(" "));
  if (!qt.length) return 0;
  const hit = qt.filter((w) => nt.has(w) || [...nt].some((x) => x.startsWith(w))).length;
  return (hit / qt.length) * 0.6;
}

export function best<T extends { name: string }>(query: string, items: T[], min = 0.45): T | null {
  let top: T | null = null;
  let topScore = min;
  for (const it of items) {
    const s = score(query, it.name);
    if (s > topScore) {
      top = it;
      topScore = s;
    }
  }
  return top;
}
