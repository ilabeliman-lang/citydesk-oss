#!/usr/bin/env node
/**
 * NDU-UPG 501/506: bundle-size budget gate for the built client (run after `vite build`).
 *   node scripts/perf-budget.mjs [--dir .vercel/output/static] [--json out.json] [--baseline base.json] [--md diff.md]
 * Budgets (bible 02, mobile): entry JS gzip < 1.2 MB; three.js absent from the entry AND from the first-map
 * chunks (map-only players never download it). The import graph is read from the built chunks themselves
 * (static `import ... from "./x.js"` vs dynamic `import("./x.js")`), so no bundler plugin is needed.
 * --baseline/--md write a per-chunk size diff (suitable as a PR comment).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const BUDGET = { entryGzip: 1.2 * 1000 * 1000, warnEntryGzip: 300 * 1000 };
const DIRS = [".vercel/output/static", ".output/public", "dist/client", "dist"];

const Q = "[\"'`]";
const STATIC_RE = new RegExp(`(?:^|[;}\\s)])(?:import|export)\\s*(?:[\\w$*{}\\s,]*?\\s*from\\s*)?${Q}\\./([^"'\`]+\\.js)${Q}`, "g");
const DYNAMIC_RE = new RegExp(`import\\(\\s*${Q}\\./([^"'\`]+\\.js)${Q}\\s*\\)`, "g");

/** Strip the content hash: WorldMap-D8DJs4Qk.js -> WorldMap */
export const chunkName = (file) => basename(file).replace(/-[\w-]{8}\.js$/, "").replace(/\.js$/, "");
export const isThree = (code) => code.includes("WebGLRenderer") && (code.includes("ShaderChunk") || code.includes("WebGLShadowMap"));

export function analyze(dir, opts = {}) {
  const assets = join(dir, "assets");
  const files = readdirSync(assets).filter((f) => f.endsWith(".js"));
  const chunks = new Map();
  for (const f of files) {
    const code = readFileSync(join(assets, f), "utf8");
    const imports = new Set([...code.matchAll(STATIC_RE)].map((m) => m[1]));
    const dynamic = new Set([...code.matchAll(DYNAMIC_RE)].map((m) => m[1]));
    chunks.set(f, { file: f, name: chunkName(f), bytes: Buffer.byteLength(code), gzip: gzipSync(code).length, three: isThree(code), hydrates: code.includes("hydrateRoot"), imports, dynamic });
  }
  const closure = (start) => {
    const seen = new Set();
    const stack = [...start];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f) || !chunks.has(f)) continue;
      seen.add(f);
      stack.push(...chunks.get(f).imports);
    }
    return seen;
  };
  const referenced = new Set();
  for (const c of chunks.values()) for (const f of [...c.imports, ...c.dynamic]) if (f !== c.file) referenced.add(f);
  const roots = [...chunks.keys()].filter((f) => !referenced.has(f));
  // The client entry is the chunk that hydrates React; shared chunks import it back, so it is not always a graph root.
  const entryRoot = opts.entry
    ? [...chunks.keys()].find((f) => chunkName(f) === opts.entry)
    : ([...chunks.values()].find((c) => c.hydrates)?.file ?? roots.sort((a, b) => closure([b]).size - closure([a]).size)[0]);
  const entry = closure(entryRoot ? [entryRoot] : []);
  const mapRoot = [...chunks.keys()].find((f) => chunkName(f) === (opts.mapChunk ?? "WorldMap"));
  const firstMap = closure([...entry, ...(mapRoot ? [mapRoot] : [])]);
  const sum = (set, k) => [...set].reduce((n, f) => n + chunks.get(f)[k], 0);
  const three = [...chunks.values()].filter((c) => c.three).map((c) => c.file);
  return {
    entryChunk: entryRoot ?? null,
    entry: { files: [...entry].sort(), bytes: sum(entry, "bytes"), gzip: sum(entry, "gzip") },
    firstMap: { files: [...firstMap].sort(), bytes: sum(firstMap, "bytes"), gzip: sum(firstMap, "gzip") },
    total: { bytes: sum(new Set(chunks.keys()), "bytes"), gzip: sum(new Set(chunks.keys()), "gzip") },
    threeChunks: three,
    threeInEntry: three.some((f) => entry.has(f)),
    threeInFirstMap: three.some((f) => firstMap.has(f)),
    chunks: Object.fromEntries([...chunks.values()].map((c) => [c.file, { name: c.name, bytes: c.bytes, gzip: c.gzip, three: c.three }])),
  };
}

export function gate(report, budget = BUDGET) {
  const errors = [];
  const warnings = [];
  if (report.entry.gzip > budget.entryGzip) errors.push(`entry JS gzip ${kb(report.entry.gzip)} > ${kb(budget.entryGzip)} (bible)`);
  else if (report.entry.gzip > budget.warnEntryGzip) warnings.push(`entry JS gzip ${kb(report.entry.gzip)} > ${kb(budget.warnEntryGzip)} soft budget`);
  if (report.threeInEntry) errors.push("three.js is in the entry chunk graph");
  if (report.threeInFirstMap) errors.push("three.js is downloaded for the first map (WorldMap static graph); lazy-load it (#504)");
  return { ok: errors.length === 0, errors, warnings };
}

const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
const sign = (n) => (n > 0 ? `+${kb(n)}` : n < 0 ? `-${kb(-n)}` : "0");

export function diffMarkdown(base, head) {
  const byName = (r) => {
    const m = new Map();
    for (const c of Object.values(r.chunks)) m.set(c.name, (m.get(c.name) ?? 0) + c.gzip);
    return m;
  };
  const a = byName(base);
  const b = byName(head);
  const rows = [
    `| | before (gzip) | after (gzip) | change |`,
    `|---|---:|---:|---:|`,
    `| **entry JS** | ${kb(base.entry.gzip)} | ${kb(head.entry.gzip)} | ${sign(head.entry.gzip - base.entry.gzip)} |`,
    `| **first map JS** | ${kb(base.firstMap.gzip)} | ${kb(head.firstMap.gzip)} | ${sign(head.firstMap.gzip - base.firstMap.gzip)} |`,
    `| all JS | ${kb(base.total.gzip)} | ${kb(head.total.gzip)} | ${sign(head.total.gzip - base.total.gzip)} |`,
    `| three.js in first map | ${base.threeInFirstMap ? "yes" : "no"} | ${head.threeInFirstMap ? "yes" : "no"} | |`,
  ];
  const names = [...new Set([...a.keys(), ...b.keys()])].filter((n) => Math.abs((b.get(n) ?? 0) - (a.get(n) ?? 0)) >= 500).sort();
  for (const n of names) rows.push(`| ${n} | ${a.has(n) ? kb(a.get(n)) : "-"} | ${b.has(n) ? kb(b.get(n)) : "-"} | ${sign((b.get(n) ?? 0) - (a.get(n) ?? 0))} |`);
  return rows.join("\n");
}

function main(argv) {
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = arg("--dir") ?? DIRS.find((d) => existsSync(join(d, "assets")));
  if (!dir) {
    console.error("perf-budget: no build output found; run `vite build` first");
    return 2;
  }
  const report = analyze(dir, { entry: arg("--entry"), mapChunk: arg("--map-chunk") });
  const verdict = gate(report);
  if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify(report, null, 2));
  console.log(`entry ${report.entryChunk}: ${kb(report.entry.gzip)} gzip (${report.entry.files.length} chunks)`);
  console.log(`first map: ${kb(report.firstMap.gzip)} gzip; all JS ${kb(report.total.gzip)} gzip`);
  console.log(`three.js chunks: ${report.threeChunks.join(", ") || "none"}; in entry: ${report.threeInEntry}; in first map: ${report.threeInFirstMap}`);
  if (arg("--baseline")) {
    const md = diffMarkdown(JSON.parse(readFileSync(arg("--baseline"), "utf8")), report);
    console.log(md);
    if (arg("--md")) writeFileSync(arg("--md"), md + "\n");
  }
  for (const w of verdict.warnings) console.warn(`WARN ${w}`);
  for (const e of verdict.errors) console.error(`FAIL ${e}`);
  console.log(verdict.ok ? "perf budget: PASS" : "perf budget: FAIL");
  return verdict.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exit(main(process.argv.slice(2)));
