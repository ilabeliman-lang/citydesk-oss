/**
 * NDU-AI safe ingest #4: scam / impersonation check for listings and claims (isomorphic, no deps, no model files).
 *
 * Rules (explainable, each with a weight and a plain-words reason) + a tiny multinomial Naive Bayes trained at
 * load from the seed corpus in ./scamCorpus.ts. The result is a REVIEW FLAG: it never blocks, bans or hides on
 * its own (hiding high scores is a separate OFF-by-default flag, `scamHold`).
 *
 * Tuned for NDU's market: "WhatsApp me" and "bank transfer" are normal for small shops here, so on their own
 * they stay below the review line; paying first through gift cards / crypto / a "deposit to release", lookalike
 * brand domains, guaranteed returns and requests for codes or seed phrases are what push a listing over.
 */
import { SCAM_SEED, OK_SEED } from "./scamCorpus.ts";

export type ScamReason =
  | "lookalike_domain"
  | "brand_impersonation"
  | "guaranteed_returns"
  | "pay_first_offplatform"
  | "credentials"
  | "urgency"
  | "contact_offplatform"
  | "shortened_link"
  | "classifier";

export type ScamCheck = {
  score: number;
  level: "ok" | "review" | "high";
  reasons: { code: ScamReason; why: string; evidence?: string }[];
  /** Always false: this check flags for a human; it never bans. Kept explicit for callers and tests. */
  autoBan: false;
};

export const REVIEW_AT = 0.3;
export const HIGH_AT = 0.6;

/** Brands people impersonate around NDU, with their real registrable domains. */
export const BRANDS: { name: string; words: string[]; domains: string[] }[] = [
  { name: "NDU / CityDesk", words: ["ndu", "citydesk"], domains: ["citydesk.example"] },
  { name: "PayPal", words: ["paypal"], domains: ["paypal.com", "paypal.me"] },
  { name: "Apple", words: ["apple", "icloud", "itunes"], domains: ["apple.com", "icloud.com"] },
  {
    name: "Google",
    words: ["google", "gmail", "googledrive"],
    domains: ["google.com", "gmail.com", "youtube.com", "goo.gl"],
  },
  {
    name: "Microsoft",
    words: ["microsoft", "outlook", "office365", "onedrive"],
    domains: ["microsoft.com", "outlook.com", "live.com", "office.com"],
  },
  { name: "Amazon", words: ["amazon"], domains: ["amazon.com", "amazon.co.uk"] },
  {
    name: "Meta",
    words: ["facebook", "instagram", "whatsapp"],
    domains: ["facebook.com", "instagram.com", "whatsapp.com", "wa.me", "fb.com"],
  },
  { name: "Netflix", words: ["netflix"], domains: ["netflix.com"] },
  { name: "Coinbase", words: ["coinbase"], domains: ["coinbase.com"] },
  { name: "Binance", words: ["binance"], domains: ["binance.com"] },
  { name: "MetaMask", words: ["metamask"], domains: ["metamask.io"] },
  { name: "Phantom", words: ["phantom"], domains: ["phantom.app", "phantom.com"] },
  { name: "Solana", words: ["solana"], domains: ["solana.com"] },
  { name: "United Airlines", words: ["mileageplus", "united airlines"], domains: ["united.com"] },
  { name: "DHL", words: ["dhl"], domains: ["dhl.com"] },
  { name: "FedEx", words: ["fedex"], domains: ["fedex.com"] },
  { name: "UPS", words: ["ups"], domains: ["ups.com"] },
  { name: "GTBank", words: ["gtbank", "gtco"], domains: ["gtbank.com", "gtco.com"] },
  { name: "Access Bank", words: ["accessbank"], domains: ["accessbankplc.com"] },
  { name: "First Bank", words: ["firstbank"], domains: ["firstbanknigeria.com"] },
  { name: "Zenith Bank", words: ["zenithbank"], domains: ["zenithbank.com"] },
  { name: "OPay", words: ["opay"], domains: ["opayweb.com"] },
  { name: "PalmPay", words: ["palmpay"], domains: ["palmpay.com"] },
  { name: "Moniepoint", words: ["moniepoint"], domains: ["moniepoint.com"] },
  { name: "MTN", words: ["mtn"], domains: ["mtn.ng", "mtn.com"] },
  { name: "Airtel", words: ["airtel"], domains: ["airtel.com.ng", "airtel.com"] },
];

const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "is.gd",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
  "tiny.cc",
  "rebrand.ly",
  "t.ly",
];
/** Two-label public suffixes we see in practice (enough to find the registrable label). */
const SECOND_LEVEL = new Set([
  "co",
  "com",
  "net",
  "org",
  "gov",
  "edu",
  "ac",
  "ng",
  "mx",
  "es",
  "uk",
]);

/** Visual confusables folded before comparing (rn->m, vv->w, cl->d, digits that pose as letters). */
export function foldConfusables(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[а]/g, "a")
    .replace(/[е]/g, "e")
    .replace(/[о]/g, "o")
    .replace(/[р]/g, "p")
    .replace(/[с]/g, "c")
    .replace(/[х]/g, "x")
    .replace(/[і]/g, "i")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/cl/g, "d")
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "l")
    .replace(/3/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/@/g, "a")
    .replace(/7/g, "t")
    .replace(/[^a-z]/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** host -> registrable domain ("login.paypal.com.evil.co" -> "evil.co"; "x.tearmet.com.mx" -> "tearmet.com.mx"). */
export function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const twoLevel = SECOND_LEVEL.has(sld) && tld.length === 2;
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

const HOST_RE =
  /\b(?:https?:\/\/)?((?:[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]+))(?=[\s/:?#)\]"',;!]|$)/giu;

export function extractHosts(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HOST_RE)) {
    const h = m[1].toLowerCase();
    if (/^\d+(\.\d+)+$/.test(h)) continue; // prices like 2.50
    out.add(h);
  }
  return [...out];
}

const OFFICIAL = new Set(BRANDS.flatMap((b) => b.domains));
/** Brand names that are also everyday words: only an exact or look-alike-character spelling counts, never a near-miss or a substring. */
const COMMON_WORDS = new Set([
  "united",
  "apple",
  "phantom",
  "outlook",
  "office",
  "live",
  "access",
  "first",
  "opay",
  "gmail",
]);
/** ...and the ones too ordinary to count even next to "support" / "official". */
const CUE_SKIP = new Set(["united", "live", "access", "first", "office", "phantom"]);

const HOW = {
  homoglyph: "swapped look-alike letters",
  typo: "misspelt",
  "brand-in-host": "brand name inside someone else's address",
  punycode: "disguised characters",
} as const;

export type LookalikeHit = {
  host: string;
  brand: string;
  how: "homoglyph" | "typo" | "brand-in-host" | "punycode";
};

/** Is this host pretending to be one of BRANDS? Official domains (and their subdomains) are never flagged. */
export function lookalike(host: string): LookalikeHit | null {
  const reg = registrable(host);
  if (OFFICIAL.has(reg)) return null;
  if (/(^|\.)xn--/.test(host)) return { host, brand: "unknown", how: "punycode" };
  const label = reg.split(".")[0];
  const folded = foldConfusables(label);
  const hostFolded = foldConfusables(host.replace(/\./g, "-"));
  for (const brand of BRANDS) {
    const targets = [
      ...brand.words.map((w) => w.replace(/\s+/g, "")),
      ...brand.domains.map((d) => d.split(".")[0]),
    ];
    for (const t of new Set(targets)) {
      if (t.length < 4) continue; // "ups", "mtn", "ndu": too short to judge by spelling
      if (folded === t && label !== t) return { host, brand: brand.name, how: "homoglyph" };
      if (COMMON_WORDS.has(t)) continue;
      if (label === t) return { host, brand: brand.name, how: "brand-in-host" }; // paypal.co, binance.xyz
      const d = levenshtein(folded, t);
      if (t.length >= 5 && d >= 1 && d <= (t.length >= 8 ? 2 : 1))
        return { host, brand: brand.name, how: "typo" };
      if (t.length >= 5 && hostFolded.includes(t))
        return { host, brand: brand.name, how: "brand-in-host" };
    }
  }
  return null;
}

/** Tokens like "Paypa1" or "G00gle" that fold onto a brand name but aren't spelled like it. */
function disguisedBrandWords(text: string): string[] {
  const hits: string[] = [];
  for (const raw of text.split(/[\s,.;:!?()"']+/)) {
    if (raw.length < 4 || /^[a-z]+$/i.test(raw)) continue;
    const f = foldConfusables(raw);
    for (const b of BRANDS) if (b.words.some((w) => w.length >= 4 && f === w)) hits.push(raw);
  }
  return hits;
}

type Rule = { code: ScamReason; weight: number; why: string; re: RegExp };

const RULES: Rule[] = [
  {
    code: "guaranteed_returns",
    weight: 0.5,
    why: "Promises guaranteed or daily returns",
    re: /\b(guarantee[ds]?\s+(?:\w+\s+){0,2}(?:profits?|returns?|income|payouts?|roi)|risk[-\s]?free\s+(?:profits?|returns?|investment)|double\s+your\s+(?:money|investment|crypto|btc)|\d+(?:\.\d+)?\s*%\s*(?:daily|per\s+day|a\s+day|every\s+day|weekly|per\s+week)|daily\s+(?:profits?|roi|returns?|interest)|passive\s+income|withdraw\s+(?:your\s+)?profits?)\b/i,
  },
  {
    code: "pay_first_offplatform",
    weight: 0.45,
    why: "Asks for payment first or outside NDU (gift cards, crypto, wire, 'deposit to release')",
    re: /\b(gift\s*cards?|itunes\s+cards?|steam\s+cards?|google\s+play\s+cards?|western\s+union|moneygram|wire\s+transfer|send\s+(?:the\s+|a\s+|your\s+)?(?:deposit|payment|fee|money)\s+(?:first|before|to\s+(?:my|this|the)\s+(?:wallet|account|number))|pay\s+(?:me\s+)?(?:directly|outside|off[-\s]?platform|before\s+(?:viewing|delivery|inspection))|(?:release|unlock|activation|clearance|processing)\s+fee|usdt|bitcoin|\bbtc\b|crypto\s+wallet|wallet\s+address)\b/i,
  },
  {
    code: "credentials",
    weight: 0.55,
    why: "Asks for a password, code, seed phrase or private key",
    re: /\b(seed\s+phrase|recovery\s+phrase|secret\s+phrase|private\s+key|12[-\s]?words?|24[-\s]?words?|(?:verify|confirm|update|validate)\s+(?:your\s+)?(?:account|password|login|wallet|identity|bvn|card)|\botp\b|one[-\s]?time\s+(?:code|password|pin)|send\s+(?:me\s+)?(?:the\s+)?(?:code|pin))\b/i,
  },
  {
    code: "urgency",
    weight: 0.2,
    why: "Pressure to act fast",
    re: /\b(act\s+now|urgent(?:ly)?|immediately|within\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)|today\s+only|last\s+chance|limited\s+(?:time|slots?|offer|spaces?)|offer\s+ends|expires?\s+(?:today|soon|tonight|in\s+\d+)|don'?t\s+miss|hurry|final\s+(?:notice|warning)|(?:account|wallet)\s+(?:will\s+be\s+)?(?:suspended|locked|closed|blocked))\b/i,
  },
  {
    code: "contact_offplatform",
    weight: 0.15,
    why: "Moves the chat off NDU (common for real shops too, so a weak signal)",
    re: /\b(whatsapp|telegram|signal\s+me|dm\s+me|inbox\s+me|t\.me\/|wa\.me\/|text\s+me\s+on)\b/i,
  },
];

const IMPERSONATION_CUE =
  /\b(official|support|customer\s+(?:care|service)|help\s*desk|helpline|verification|security\s+team|agent|representative|staff|team|department|refund|claims?\s+desk)\b/i;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/\b[\w-]+(\.[\w-]+)+\b/g, " url ")
    .replace(/\d+(\.\d+)?/g, " num ")
    .split(/[^a-z%]+/)
    .filter((t) => t.length > 1);
}

function features(text: string): string[] {
  const t = tokens(text);
  const out = [...t];
  for (let i = 0; i + 1 < t.length; i += 1) out.push(`${t[i]}_${t[i + 1]}`);
  return out;
}

type NB = {
  prior: [number, number];
  counts: [Map<string, number>, Map<string, number>];
  totals: [number, number];
  vocab: number;
};

function train(scam: string[], ok: string[]): NB {
  const counts: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  const totals: [number, number] = [0, 0];
  const vocab = new Set<string>();
  [scam, ok].forEach((set, c) => {
    for (const line of set) {
      for (const f of features(line)) {
        counts[c].set(f, (counts[c].get(f) ?? 0) + 1);
        totals[c] += 1;
        vocab.add(f);
      }
    }
  });
  const n = scam.length + ok.length;
  return { prior: [scam.length / n, ok.length / n], counts, totals, vocab: vocab.size };
}

let model: NB | null = null;

/** P(scam | text) from the seed-trained Naive Bayes (features unseen in training are ignored). */
export function classifierScore(text: string): number {
  model ??= train(SCAM_SEED, OK_SEED);
  const m = model;
  const lp = [Math.log(m.prior[0]), Math.log(m.prior[1])];
  let seen = 0;
  for (const f of features(text)) {
    if (!m.counts[0].has(f) && !m.counts[1].has(f)) continue;
    seen += 1;
    for (const c of [0, 1] as const)
      lp[c] += Math.log(((m.counts[c].get(f) ?? 0) + 1) / (m.totals[c] + m.vocab));
  }
  if (!seen) return 0;
  const mx = Math.max(lp[0], lp[1]);
  const a = Math.exp(lp[0] - mx);
  const b = Math.exp(lp[1] - mx);
  return a / (a + b);
}

/** Check one listing / claim / note. `fields` are joined, so pass name + offer + description together. */
export function scamCheck(...fields: (string | null | undefined)[]): ScamCheck {
  const text = fields.filter(Boolean).join("\n").slice(0, 4000);
  const reasons: ScamCheck["reasons"] = [];
  const weights: number[] = [];
  const add = (code: ScamReason, weight: number, why: string, evidence?: string) => {
    if (reasons.some((r) => r.code === code)) return;
    reasons.push({ code, why, ...(evidence ? { evidence } : {}) });
    weights.push(weight);
  };
  for (const host of extractHosts(text)) {
    const hit = lookalike(host);
    if (hit)
      add(
        "lookalike_domain",
        0.6,
        hit.brand === "unknown"
          ? "Link uses disguised characters"
          : `Link looks like ${hit.brand} but isn't (${HOW[hit.how]})`,
        host,
      );
    if (SHORTENERS.includes(registrable(host)) || SHORTENERS.includes(host))
      add("shortened_link", 0.15, "Hides where a link really goes", host);
  }
  const disguised = disguisedBrandWords(text);
  if (disguised.length)
    add(
      "brand_impersonation",
      0.45,
      "Spells a brand name with look-alike characters",
      disguised[0],
    );
  if (IMPERSONATION_CUE.test(text)) {
    const lower = ` ${text.toLowerCase()} `;
    const brand = BRANDS.find((b) =>
      b.words.some((w) => !CUE_SKIP.has(w) && new RegExp(`\\b${w}\\b`).test(lower)),
    );
    if (brand) add("brand_impersonation", 0.4, `Claims to speak for ${brand.name}`, brand.name);
  }
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) add(r.code, r.weight, r.why, m[0].slice(0, 40));
  }
  const rules = 1 - weights.reduce((p, w) => p * (1 - w), 1);
  const nb = classifierScore(text);
  // The classifier can lift a borderline listing into review, but it can't create a "high" on its own.
  let score = rules + (1 - rules) * 0.45 * nb;
  if (!weights.length && nb >= 0.9) add("classifier", 0, "Reads like known scam listings");
  if (!weights.length) score = Math.min(score, HIGH_AT - 0.01);
  score = Math.round(score * 1000) / 1000;
  return {
    score,
    level: score >= HIGH_AT ? "high" : score >= REVIEW_AT ? "review" : "ok",
    reasons,
    autoBan: false,
  };
}
