// NDU-UPG 501/502/503: unit tests for the bundle budget gate, plus the pure tier + ladder logic (TS, via a child node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, chunkName, diffMarkdown, gate } from "./perf-budget.mjs";

const THREE = "class WebGLRenderer{} const ShaderChunk={};";

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "perf-budget-"));
  mkdirSync(join(dir, "assets"));
  for (const [name, code] of Object.entries(files)) writeFileSync(join(dir, "assets", name), code);
  return dir;
}

test("chunkName strips content hashes", () => {
  assert.equal(chunkName("WorldMap-vh-t_kPv.js"), "WorldMap");
  assert.equal(chunkName("assets/draco_wasm_wrapper-fZCQGLGb.js"), "draco_wasm_wrapper");
});

test("three.js reachable only through a dynamic import passes", () => {
  const dir = fixture({
    "index-AAAAAAAA.js": 'import{a}from"./react-BBBBBBBB.js";import("./WorldMap-CCCCCCCC.js");',
    "react-BBBBBBBB.js": "export const a=1;",
    "WorldMap-CCCCCCCC.js": 'import{a}from"./react-BBBBBBBB.js";const go=()=>import("./scanLayer-DDDDDDDD.js");',
    "scanLayer-DDDDDDDD.js": 'import"./three-EEEEEEEE.js";',
    "three-EEEEEEEE.js": THREE,
  });
  const r = analyze(dir);
  assert.equal(r.entryChunk, "index-AAAAAAAA.js");
  assert.deepEqual(r.entry.files, ["index-AAAAAAAA.js", "react-BBBBBBBB.js"]);
  assert.equal(r.threeInEntry, false);
  assert.equal(r.threeInFirstMap, false);
  assert.equal(gate(r).ok, true);
});

test("three.js statically imported by the map fails the gate", () => {
  const dir = fixture({
    "index-AAAAAAAA.js": 'import("./WorldMap-CCCCCCCC.js");',
    "WorldMap-CCCCCCCC.js": 'import{x}from"./figures-FFFFFFFF.js";',
    "figures-FFFFFFFF.js": THREE,
  });
  const r = analyze(dir);
  assert.equal(r.threeInFirstMap, true);
  const v = gate(r);
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /#504/);
});

test("entry over 1.2 MB gzip fails; diff markdown lists changes", () => {
  const dir = fixture({ "index-AAAAAAAA.js": "x" });
  const r = analyze(dir);
  assert.equal(gate(r, { entryGzip: 1, warnEntryGzip: 0 }).ok, false);
  const md = diffMarkdown({ ...r, entry: { ...r.entry, gzip: r.entry.gzip + 5000 } }, r);
  assert.match(md, /entry JS/);
});

test("tier + ladder pure logic (TypeScript)", () => {
  const ts = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "world", "perf", "perf.test.ts");
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--test", ts], { stdio: "pipe" });
});
