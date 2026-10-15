/**
 * NDU-AI search (items D96/D97/D103): text normalisation, tokens, typo distance and the local
 * word families that let short map queries hit OSM tags ("chemist" -> pharmacy, "keke" -> tricycle).
 * Pure, alias-free and dependency-free so node --experimental-strip-types can test it.
 */

const STOP = new Set(
  "a an and any are at be buy by can for from get go how i in is it me my near nearby next of on or please show some take that the there to want where which who with find".split(" "),
);

/** Lowercase, strip accents and punctuation (keeps letters/digits in every script). */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A light English stemmer: enough to make "markets", "marketing" and "market" meet. */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("es") && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string, keepStop = false): string[] {
  const out: string[] = [];
  for (const w of fold(text).split(" ")) {
    if (!w) continue;
    if (!keepStop && STOP.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/**
 * Word families. Every word on a row expands to the row's first word (the canonical tag) and back,
 * so a query and a document meet even when they use different local words. Kept small and concrete.
 */
const FAMILIES: string[][] = [
  ["market", "marketplace", "supermarket", "mall", "bazaar", "kasuwa", "oja", "ahia", "shop", "store"],
  ["pharmacy", "chemist", "drugstore", "medicine", "drug", "pharmacist"],
  ["hospital", "clinic", "doctor", "health", "medical", "nurse", "sick"],
  ["food", "restaurant", "eat", "eatery", "cafe", "canteen", "buka", "bukka", "chop", "mama put", "fast_food", "food_court", "hungry", "lunch", "dinner"],
  ["bakery", "bread", "bake", "cake"],
  ["fuel", "filling", "petrol", "gas", "diesel", "fuel_station"],
  ["church", "cathedral", "chapel", "parish", "place_of_worship", "worship", "pray"],
  ["mosque", "masjid", "islam", "juma", "pray"],
  ["school", "college", "academy", "university", "class", "education", "study"],
  ["bank", "atm", "money", "cash", "pos"],
  ["bus", "bus_stop", "danfo", "transit", "park", "motor park", "garage"],
  ["keke", "tricycle", "napep", "okada", "bike", "ride"],
  ["hotel", "guest", "lodge", "inn", "sleep", "stay", "room"],
  ["tall", "tower", "high", "highrise", "skyscraper", "storey", "story", "floor", "tallest", "big building"],
  ["quiet", "calm", "peaceful", "residential", "close", "crescent", "side", "lane", "estate", "living_street"],
  ["busy", "main", "primary", "trunk", "expressway", "highway", "major", "road", "avenue"],
  ["street", "road", "avenue", "close", "crescent", "lane", "way", "drive", "highway"],
  ["office", "work", "job", "company", "business", "shift"],
  ["toilet", "toilets", "wash", "water", "standpipe", "drinking_water", "borehole"],
  ["salon", "barber", "barbershop", "hair", "beauty", "hairdresser"],
  ["tailor", "fashion", "clothes", "cloth", "boutique", "clothing"],
  ["phone", "mobile", "repair", "electronics", "gadget"],
  ["bar", "pub", "drink", "beer", "lounge", "club"],
  ["home", "house", "flat", "apartment", "residential", "yard", "compound"],
  // "Mile 1" and "Mile One" are the same roundabout
  ...["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].map((w, i) => [w, String(i + 1)]),
];

const FAMILY_OF = new Map<string, Set<string>>();
for (const row of FAMILIES) {
  const head = stem(fold(row[0]).replace(/ /g, "_"));
  const all = row.map((w) => stem(fold(w).replace(/ /g, "_")));
  for (const w of all) {
    const set = FAMILY_OF.get(w) ?? new Set<string>();
    set.add(head);
    if (w === head) for (const x of all) set.add(x);
    FAMILY_OF.set(w, set);
  }
}

/** Expansions for one query token (excluding the token itself). */
export function family(token: string): string[] {
  const set = FAMILY_OF.get(token);
  return set ? [...set].filter((t) => t !== token) : [];
}

/** Damerau-Levenshtein (optimal string alignment) distance, capped: returns cap+1 once it is exceeded. */
export function editDistance(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = new Array<number>(n + 1).fill(0);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** How many typos a word of this length may carry and still count as a match. */
export const typoBudget = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** Metres between two points (equirectangular; fine at street scale). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (b.lng - a.lng) * 111320 * k;
  const dy = (b.lat - a.lat) * 110540;
  return Math.hypot(dx, dy);
}

/** Small stable hash (FNV-1a, hex) for cache keys of embedded texts. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
