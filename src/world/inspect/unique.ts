// NDU-UPG inspect (#04): what makes this object stand out nearby. Deterministic, ≤ 3 lines. Pure.
import { MATERIALS, type MaterialKey } from "../render/materialCatalog.ts";
import type { CellStats } from "../realism/buildingsData.ts";

export type UniqueFacts = { height: number; heightTagged: boolean; year: number | null; wall: MaterialKey | null; roof: MaterialKey | null; levels: number };

export function uniqueLines(p: UniqueFacts, stats: CellStats | null): string[] {
  const out: { score: number; text: string }[] = [];
  if (stats && stats.n >= 10) {
    if (p.height >= stats.hMax && p.height > stats.hP50) out.push({ score: 100, text: "Tallest mapped building nearby" });
    else if (p.height >= stats.hP99) out.push({ score: 90, text: "Taller than 99% of mapped buildings nearby" });
    else if (p.height >= stats.hP90) out.push({ score: 70, text: "Taller than 90% of mapped buildings nearby" });
    if (p.year !== null && stats.yearN >= 5 && stats.yearP05 !== null && p.year <= stats.yearP05) out.push({ score: 80, text: "Older than 95% of mapped buildings nearby" });
  }
  if (p.wall || p.roof) {
    const w = p.wall ? `${MATERIALS[p.wall].label} walls` : "";
    const r = p.roof ? `${MATERIALS[p.roof].label.toLowerCase()} roof` : "";
    out.push({ score: 50, text: `${[w, r].filter(Boolean).join(", ")} (tagged)`.replace(/^./, (c) => c.toUpperCase()) });
  }
  if (p.heightTagged) out.push({ score: 30, text: "Height surveyed in OpenStreetMap" });
  return out
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, 3)
    .map((x) => x.text);
}
