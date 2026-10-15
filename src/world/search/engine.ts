/**
 * NDU-AI hybrid search engine (items D96 semantic search, D97 hybrid BM25 + vector, D103 typo
 * tolerance). Lexical BM25 with typo/prefix/word-family expansion, an optional dense vector score
 * from the on-device embedding model, and map-aware boosts parsed from the query: "near <X>",
 * "quiet"/"busy", "tall"/"tallest", and the kind of thing asked for (street, building, place).
 * Pure and alias-free (node --experimental-strip-types tests it; no model needed for tests).
 */
import type { SearchDoc } from "./docs.ts";
import { editDistance, family, fold, metres, tokens, typoBudget } from "./text.ts";

export type Pt = { lat: number; lng: number };

export type ParsedQuery = {
  raw: string;
  /** Terms of the main clause (what the person wants). */
  terms: string[];
  /** Phrases after "near", "by", "close to", ... (where it should be). */
  anchors: string[];
  wantKind: "street" | "building" | "place" | null;
  quiet: boolean;
  busy: boolean;
  tall: boolean;
  tallest: boolean;
};

const ANCHOR_RE = /\b(?:near|nearby|by|beside|besides|next to|close to|around|behind|opposite|across from|off|along|at)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?=\s+(?:with|and|that|which|where|having|has)\b|[,;]|$)/gi;
const STREET_W = /\b(street|streets|road|roads|lane|close|crescent|avenue|way|drive|expressway|highway|junction)\b/;
const BUILDING_W = /\b(building|buildings|tower|towers|block|house|skyscraper|highrise|storey)\b/;
const PLACE_W = /\b(place|shop|store|restaurant|market|chemist|pharmacy|church|mosque|school|bank|hotel|bakery|salon|clinic|hospital|bar|station)\b/;

export function parseQuery(q: string): ParsedQuery {
  const raw = q.trim();
  const low = ` ${fold(raw)} `;
  const anchors: string[] = [];
  const main = low.replace(ANCHOR_RE, (_m, phrase: string) => {
    const p = phrase.trim();
    if (p) anchors.push(p);
    return " ";
  });
  // The thing asked for is named before any "with ..." clause: "street ... with a tall building".
  const head = main.split(/\b(?:with|having|that has|which has)\b/)[0];
  const tail = main.slice(head.length);
  const kindOf = (s: string) => (STREET_W.test(s) ? "street" : BUILDING_W.test(s) ? "building" : PLACE_W.test(s) ? "place" : null);
  const wantKind = kindOf(head) ?? (anchors.length || tail.trim() ? null : kindOf(main));
  const all = `${main} ${anchors.join(" ")}`;
  return {
    raw,
    terms: tokens(head + (wantKind ? "" : tail)),
    anchors,
    wantKind,
    quiet: /\b(quiet|calm|peaceful|silent|sleepy|side)\b/.test(main),
    busy: /\b(busy|main|major|crowded|lively)\b/.test(main),
    tall: /\b(tall|tallest|high|highest|highrise|skyscraper|tower|big building|storey)\b/.test(all),
    tallest: /\b(tallest|highest|biggest building)\b/.test(all),
  };
}

type Posting = { doc: number; tf: number };

/** BM25 over title (counted twice) + sub + text, with typo, prefix and word-family expansion. */
export class Bm25 {
  readonly docs: SearchDoc[];
  private post = new Map<string, Posting[]>();
  private len: number[] = [];
  private avg = 1;
  private vocab: string[] = [];
  constructor(docs: SearchDoc[]) {
    this.docs = docs;
    docs.forEach((d, i) => {
      const toks = [...tokens(d.title, true), ...tokens(d.title), ...tokens(d.sub), ...tokens(d.text)];
      this.len[i] = toks.length;
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [t, n] of tf) {
        let list = this.post.get(t);
        if (!list) this.post.set(t, (list = []));
        list.push({ doc: i, tf: n });
      }
    });
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length) || 1;
    this.vocab = [...this.post.keys()];
  }

  /** Vocabulary terms a query term may stand for, with a weight in (0, 1]. */
  expand(term: string, isLast = false): Map<string, number> {
    const out = new Map<string, number>();
    const add = (t: string, w: number) => {
      if (this.post.has(t) && (out.get(t) ?? 0) < w) out.set(t, w);
    };
    add(term, 1);
    for (const f of family(term)) add(f, 0.6);
    const budget = typoBudget(term.length);
    for (const v of this.vocab) {
      if (v === term) continue;
      if (budget && Math.abs(v.length - term.length) <= budget) {
        const d = editDistance(term, v, budget);
        if (d <= budget) add(v, d === 1 ? 0.75 : 0.5);
      }
      if (isLast && term.length >= 3 && v.length > term.length && v.startsWith(term)) add(v, 0.7);
    }
    // a misspelt family word ("chemst") still reaches its family
    if (out.size && !this.post.has(term)) for (const [t, w] of [...out]) for (const f of family(t)) add(f, 0.5 * w);
    return out;
  }

  scores(terms: string[]): Float64Array {
    const s = new Float64Array(this.docs.length);
    const N = this.docs.length;
    const k1 = 1.2;
    const b = 0.75;
    terms.forEach((term, ti) => {
      // Per term, a document scores its best matching expansion only (no double counting).
      const best = new Float64Array(N);
      for (const [t, w] of this.expand(term, ti === terms.length - 1)) {
        const list = this.post.get(t) ?? [];
        const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5));
        for (const p of list) {
          const v = (w * idf * (p.tf * (k1 + 1))) / (p.tf + k1 * (1 - b + (b * this.len[p.doc]) / this.avg));
          if (v > best[p.doc]) best[p.doc] = v;
        }
      }
      for (let i = 0; i < N; i += 1) s[i] += best[i];
    });
    return s;
  }
}

/** Distance from a point to a document: the polyline for streets, the point otherwise. */
export function docDistance(doc: SearchDoc, p: Pt): number {
  if (!doc.pts || doc.pts.length < 2) return metres(doc, p);
  let best = Infinity;
  for (let i = 1; i < doc.pts.length; i += 1) {
    const a = { lng: doc.pts[i - 1][0], lat: doc.pts[i - 1][1] };
    const c = { lng: doc.pts[i][0], lat: doc.pts[i][1] };
    // project onto the segment in a local metric frame
    const k = Math.cos((p.lat * Math.PI) / 180);
    const ax = (a.lng - p.lng) * k;
    const ay = a.lat - p.lat;
    const cx = (c.lng - p.lng) * k;
    const cy = c.lat - p.lat;
    const dx = cx - ax;
    const dy = cy - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-18)));
    const d = Math.hypot(ax + t * dx, ay + t * dy) * 110900;
    if (d < best) best = d;
  }
  return best;
}

export type Hit = { doc: SearchDoc; score: number; reasons: string[] };

export type SearchOptions = {
  /** Where the person is looking (small tie-break toward nearby hits). */
  here?: Pt | null;
  /** Unit-length query embedding and unit-length document embeddings (by doc id), if the model is ready. */
  qvec?: Float32Array | null;
  vecs?: Map<string, Float32Array>;
  limit?: number;
};

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
};

const near = (d: number, scale: number) => Math.exp(-d / scale);

export class SearchIndex {
  readonly bm25: Bm25;
  readonly docs: SearchDoc[];
  private maxH: number;
  constructor(docs: SearchDoc[]) {
    this.docs = docs;
    this.bm25 = new Bm25(docs);
    this.maxH = Math.max(12, ...docs.map((d) => d.heightM ?? 0));
  }

  /** Documents that best match an anchor phrase ("the market"), used for "near <X>". */
  anchorDocs(phrase: string): SearchDoc[] {
    const terms = tokens(phrase);
    if (!terms.length) return [];
    const s = this.bm25.scores(terms);
    const max = Math.max(0, ...s);
    if (max <= 0) return [];
    return this.docs
      .map((doc, i) => ({ doc, v: s[i] }))
      .filter((x) => x.v >= 0.6 * max)
      .sort((a, b) => b.v - a.v)
      .slice(0, 6)
      .map((x) => x.doc);
  }

  search(query: string, opts: SearchOptions = {}): Hit[] {
    const pq = parseQuery(query);
    const N = this.docs.length;
    if (!N || !pq.raw) return [];
    const lexRaw = this.bm25.scores(pq.terms);
    const lexMax = Math.max(0, ...lexRaw);
    // Dense scores, min-max normalised over the documents that have vectors.
    let sem: Float64Array | null = null;
    if (opts.qvec && opts.vecs && opts.vecs.size) {
      sem = new Float64Array(N).fill(-1);
      let lo = Infinity;
      let hi = -Infinity;
      this.docs.forEach((d, i) => {
        const v = opts.vecs!.get(d.id);
        if (!v || v.length !== opts.qvec!.length) return;
        const c = dot(opts.qvec!, v);
        sem![i] = c;
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      });
      const span = hi - lo || 1;
      for (let i = 0; i < N; i += 1) sem[i] = sem[i] < -0.5 ? 0 : (sem[i] - lo) / span;
    }
    const anchorSets = pq.anchors.map((a) => ({ phrase: a, docs: this.anchorDocs(a) })).filter((a) => a.docs.length);
    const anchorIds = new Set(anchorSets.flatMap((a) => a.docs.map((d) => d.id)));
    const tallOnes = pq.tall ? this.docs.filter((d) => (d.heightM ?? 0) >= Math.max(18, this.maxH * 0.5)) : [];
    const hits: Hit[] = [];
    for (let i = 0; i < N; i += 1) {
      const doc = this.docs[i];
      const reasons: string[] = [];
      const lex = lexMax > 0 ? lexRaw[i] / lexMax : 0;
      let score = sem ? 0.55 * lex + 0.45 * sem[i] : lex;
      if (!pq.terms.length && !sem) score = 0; // a pure "near X" query ranks by the boosts below
      const kindOk = pq.wantKind === "street" ? doc.kind === "street" : pq.wantKind === "building" ? doc.kind === "building" : doc.kind !== "street" && doc.kind !== "building";
      if (doc.kind === "street" && pq.quiet) {
        score += 0.35 * (1 - (doc.busy ?? 0.3));
        if ((doc.busy ?? 1) <= 0.2) reasons.push("quiet street");
      }
      if (doc.kind === "street" && pq.busy) {
        score += 0.35 * (doc.busy ?? 0.3);
        if ((doc.busy ?? 0) >= 0.7) reasons.push("main road");
      }
      if (pq.tall && doc.kind === "building" && doc.heightM) {
        const t = doc.heightM / this.maxH;
        score += (pq.tallest ? 0.9 : 0.45) * t * t;
        if (doc.heightM >= 18) reasons.push(`${Math.round(doc.heightM)} m tall`);
      } else if (pq.tall && tallOnes.length && doc.kind !== "building") {
        let best = Infinity;
        let by: SearchDoc | null = null;
        for (const b of tallOnes) {
          const d = docDistance(doc, b);
          if (d < best) {
            best = d;
            by = b;
          }
        }
        const v = near(best, 120);
        score += 0.3 * v;
        if (by && best < 150) reasons.push(`by a ${Math.round(by.heightM ?? 0)} m building`);
      }
      for (const a of anchorSets) {
        let best = Infinity;
        let at: SearchDoc | null = null;
        for (const d of a.docs) {
          if (d.id === doc.id) continue;
          const m = docDistance(doc, d);
          if (m < best) {
            best = m;
            at = d;
          }
        }
        const v = near(best, 220);
        score += 0.45 * v;
        if (at && best < 300) reasons.push(`${Math.round(best / 10) * 10 || 10} m from ${at.title}`);
      }
      // The kind asked for (street / building / place) lifts relevant hits only; it never makes a hit.
      if (pq.wantKind && score > 0.08) score += kindOk ? 0.3 : -0.25;
      // "near the market" asks for something by the market, not the market itself.
      if (anchorIds.has(doc.id) && (pq.terms.length || pq.wantKind)) score -= 0.35;
      if (opts.here && score > 0.08) score += 0.05 * near(metres(doc, opts.here), 1500);
      if (lex >= 0.99 && !reasons.length) reasons.push("name match");
      if (sem && sem[i] > 0.85 && lex < 0.3) reasons.push("similar meaning");
      hits.push({ doc, score, reasons });
    }
    const floor = 0.18;
    return hits
      .filter((h) => h.score > floor)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 8);
  }
}
