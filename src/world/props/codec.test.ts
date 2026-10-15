import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { decodeCell, encodeCell } from "./codec.ts";
import { parseProps } from "./parse.ts";
import { inferProps } from "./infer.ts";
import { projAt } from "./geo.ts";
import type { CellBox, OsmEl, PropRecord } from "./types.ts";

const box = (lat: number, lng: number): CellBox => ({ south: lat - 0.003, west: lng - 0.004, north: lat + 0.003, east: lng + 0.004 });
const els = (JSON.parse(readFileSync(new URL("./__fixtures__/london-cell.json", import.meta.url), "utf8")) as { elements: OsmEl[] }).elements;
const parsed = parseProps(els, box(51.5226, -0.1265), "Europe/London");
const recs = inferProps(parsed, [], { unlitRoads: false });

describe("codec", () => {
  it("round-trips at decimetre precision", () => {
    const p = encodeCell(recs, "1:2", parsed.origin, { fetchedAt: 1, osmBase: null });
    const back = decodeCell(JSON.parse(JSON.stringify(p)));
    assert.equal(back.length, recs.length);
    const proj = projAt(...parsed.origin);
    back.forEach((b, i) => {
      const a = recs[i];
      const [ax, ay] = proj.toXY(a.lng, a.lat);
      const [bx, by] = proj.toXY(b.lng, b.lat);
      assert.ok(Math.hypot(ax - bx, ay - by) <= 0.071, "position within 1 dm");
      assert.equal(b.kind, a.kind);
      assert.equal(b.archetype, a.archetype);
      assert.equal(b.osmId, a.osmId);
      assert.equal(b.osmType, a.osmType);
      assert.equal(b.src, a.src);
      assert.equal(b.variant, a.variant);
      assert.ok(Math.abs(b.heightM - a.heightM) <= 0.051);
      assert.equal(!!b.lit, !!a.lit);
      assert.deepEqual(b.tree, a.tree);
      assert.deepEqual(b.lamp, a.lamp);
    });
    assert.equal(p.counts.osm + p.counts.inferred, recs.length);
  });
  it("2,500 records gzip under 40 kB", () => {
    const many: PropRecord[] = [];
    for (let i = 0; i < 2500; i++) {
      const r = recs[i % recs.length];
      many.push({ ...r, osmId: r.osmId + i * 7, lng: r.lng + (i % 50) * 0.00003, lat: r.lat + Math.floor(i / 50) * 0.00002 });
    }
    const p = encodeCell(many, "1:2", parsed.origin, { fetchedAt: 1, osmBase: "x" });
    const kb = gzipSync(JSON.stringify(p)).length / 1024;
    assert.ok(kb < 40, `${kb.toFixed(1)} kB`);
  });
  it("rejects a version mismatch", () => {
    const p = encodeCell(recs.slice(0, 2), "1:2", parsed.origin, { fetchedAt: 1, osmBase: null });
    assert.throws(() => decodeCell({ ...p, v: 2 as unknown as 1 }));
  });
});
