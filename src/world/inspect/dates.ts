// NDU-UPG inspect (#04): OSM start_date parsing. Pure.
export type DatePrecision = "day" | "month" | "year" | "approx" | "decade" | "century" | "range" | "before" | "after";
export type ParsedDate = { year: number; precision: DatePrecision; raw: string };

const CENTURY_PART: Record<string, number> = { early: 15, mid: 50, late: 85 };

export function parseStartDate(raw?: string | null, nowYear = new Date().getFullYear()): ParsedDate | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.length > 40) return null;
  const v = s.toLowerCase();
  const ok = (year: number, precision: DatePrecision): ParsedDate | null =>
    Number.isInteger(year) && year >= 1000 && year <= nowYear + 10 ? { year, precision, raw: s } : null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31 ? ok(Number(m[1]), "day") : null;
  if ((m = v.match(/^(\d{4})-(\d{2})$/))) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? ok(Number(m[1]), "month") : null;
  if ((m = v.match(/^(\d{4})$/))) return ok(Number(m[1]), "year");
  if ((m = v.match(/^~\s*(\d{4})$/)) || (m = v.match(/^(?:c\.|ca\.?|circa)\s*(\d{4})$/))) return ok(Number(m[1]), "approx");
  if ((m = v.match(/^(\d{3}0)s$/))) return ok(Number(m[1]) + 5, "decade");
  if ((m = v.match(/^(?:(early|mid|late)\s+)?c(\d{2})$/))) {
    const c = Number(m[2]);
    if (c < 11) return null;
    return ok((c - 1) * 100 + (m[1] ? CENTURY_PART[m[1]] : 50), "century");
  }
  if ((m = v.match(/^before\s+(\d{4})$/))) return ok(Number(m[1]), "before");
  if ((m = v.match(/^after\s+(\d{4})$/))) return ok(Number(m[1]), "after");
  if ((m = v.match(/^(\d{4})\s*\.\.\s*(\d{4})$/))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (b < a) return null;
    return ok(a, "range") && ok(b, "range") ? ok(Math.round((a + b) / 2), "range") : null;
  }
  return null;
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

export function ageText(p: ParsedDate | null, nowYear = new Date().getFullYear()): string {
  if (!p) return "Age: not mapped";
  if (p.year > nowYear) return `planned (${p.year})`;
  const age = nowYear - p.year;
  switch (p.precision) {
    case "century":
      return `${ordinal(Math.floor(p.year / 100) + 1)} century`;
    case "decade":
      return `built in the ${p.year - 5}s (≈ ${age} years)`;
    case "approx":
    case "range":
      return `built about ${p.year} (≈ ${age} years)`;
    case "before":
      return `built before ${p.year} (over ${age} years)`;
    case "after":
      return `built after ${p.year} (under ${age} years)`;
    default:
      return `built ${p.year} (${age} year${age === 1 ? "" : "s"})`;
  }
}
