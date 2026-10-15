/**
 * NDU-AI avatar-bot assistant: moderation gate for every line in and every line out.
 *
 * The LitServe gateway on the studio serves no moderation model (no Llama Guard, no ShieldGemma;
 * the only local model is an uncensored coder), so this is a rules + keyword gate. It is deliberately
 * conservative: it blocks sexual content, scams / money-extraction, secrets, jailbreak attempts and
 * anything that would steer the assistant toward wallets, minting, payments or GreenFunds. 18+ safe
 * defaults: nothing adult is ever answered.
 *
 * Pure + dependency-free so it runs in node tests and on the server proxy.
 */

export type Verdict = "allow" | "block";
export type Moderation = { verdict: Verdict; category: string; note: string };

const SAFE_NOTE =
  "I can't help with that. Ask me about the map, the weather, or a building instead.";

type Rule = { category: string; re: RegExp };

const RULES: Rule[] = [
  {
    category: "adult",
    re: /\b(porn|porno|xxx|nude|nudes|nsfw|hentai|sex(?:ual)?|blowjob|handjob|cum(?:shot)?|orgasm|masturbat\w*|erotic|fetish|onlyfans|escort|prostitut\w*|dick|cock|pussy|boobs|tits)\b/i,
  },
  {
    category: "minor-safety",
    re: /\b(child porn|loli|lolita|underage|preteen|jailbait|minor(?:s)? (?:nude|sex|porn))\b/i,
  },
  {
    category: "money",
    re: /(green[\s_-]?funds?|tradeforge|guaranteed (?:return|profit|yield)|daily (?:yield|return|profit)|passive income|double your (?:money|crypto)|send (?:me )?(?:your )?(?:seed|private key|wallet|crypto|usdc|sol)|seed phrase|private key|mnemonic|airdrop|connect (?:your )?wallet|sign (?:this )?transaction|wallet drain|pay (?:me|us) in (?:crypto|usdc|sol|btc))/i,
  },
  {
    category: "secrets",
    re: /(api[_\s-]?key|secret[_\s-]?key|access[_\s-]?token|bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9]{10,}|-----begin [a-z ]*private key)/i,
  },
  {
    category: "jailbreak",
    re: /(ignore (?:all |your |the )?(?:previous|prior|above) (?:instructions|rules|prompt)|disregard (?:your|the) (?:rules|instructions)|you are now (?:dan|unfiltered|jailbroken)|do anything now|developer mode|bypass (?:the )?(?:filter|moderation|safety)|reveal (?:your )?(?:system prompt|instructions))/i,
  },
  {
    category: "harm",
    re: /\b(how to (?:make|build) (?:a )?(?:bomb|explosive|meth|fentanyl)|kill (?:yourself|myself|him|her|them)|suicide method)\b/i,
  },
];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Undo the usual dodges: l33t digits, "s.e.x" / "s e x" spacing, zero-width characters, accents. */
export function normalize(text: string): string {
  const base = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, "")
    .toLowerCase();
  const leet = base.replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch);
  // Join runs of single letters separated by dots/dashes/spaces: "s.e.x" -> "sex".
  return leet.replace(/\b(?:[a-z][\s.\-_*]){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]/g, ""));
}

/** Classify one piece of text. Empty text is allowed (nothing to moderate). */
export function moderate(text: unknown): Moderation {
  const s = typeof text === "string" ? text.slice(0, 4000) : "";
  if (!s.trim()) return { verdict: "allow", category: "empty", note: "" };
  const variants = [s, normalize(s)];
  for (const rule of RULES) {
    if (variants.some((v) => rule.re.test(v)))
      return { verdict: "block", category: rule.category, note: SAFE_NOTE };
  }
  return { verdict: "allow", category: "ok", note: "" };
}

/** Remove emails, phone numbers and long digit runs (cards, accounts) before anything is remembered or sent. */
export function redactPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?\d[\s-]?){9,}/g, "[number]");
}

/** The reply the assistant shows when a line is blocked. */
export const REFUSAL = SAFE_NOTE;

/** Strip model-control tokens and clamp length before moderation or display. */
export function sanitize(text: unknown, max = 600): string {
  return String(text ?? "")
    .replace(/<\/?(?:system|assistant|user|tool|function)[^>]*>/gi, "")
    .split("")
    .filter(
      (ch) =>
        ch === "\n" ||
        ch === "\t" ||
        ch === "\r" ||
        (ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127),
    )
    .join("")
    .trim()
    .slice(0, max);
}

/** Drop every ASCII control character (including newlines). */
export function stripControl(text: string): string {
  return [...text].filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join("");
}
