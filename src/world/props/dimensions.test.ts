import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REGIONAL_TREES, SPECIES, clampFor, isPalm, kelvinFor, lampHeightForRoad, parseDirection, parseHeight, treeSize } from "./dimensions.ts";

describe("parseHeight", () => {
  const cases: [string | undefined, number | null][] = [
    ["12", 12], ["12 m", 12], ["12m", 12], ["12.5", 12.5], ["12,5", 12.5], ["40'", 12.192], ["40 ft", 12.192],
    ["~8", 8], ["8;10", 10], ["10;8", 10], ["unknown", null], ["tall", null], ["", null], [undefined, null],
    ["0", null], ["-3", null], ["6 metres", 6], ["250 cm", 2.5], ["12'6\"", 3.81], ["~ 7 m", 7],
  ];
  for (const [raw, want] of cases) {
    it(`${JSON.stringify(raw)} → ${want}`, () => {
      const got = parseHeight(raw);
      if (want == null) assert.equal(got, null);
      else assert.ok(got != null && Math.abs(got - want) < 0.01, `got ${got}`);
    });
  }
});

describe("clamps + lamps", () => {
  it("clamps per kind and rejects garbage", () => {
    assert.equal(clampFor("lamp", 300), null);
    assert.equal(clampFor("lamp", 2), 2.5);
    assert.equal(clampFor("lamp", 30), 20);
    assert.equal(clampFor("tree", 0), null);
    assert.equal(clampFor("tree", 18), 18);
  });
  it("lamp height by road class", () => {
    assert.equal(lampHeightForRoad("residential"), 5.5);
    assert.equal(lampHeightForRoad("primary"), 9);
    assert.equal(lampHeightForRoad("motorway"), 12);
    assert.equal(lampHeightForRoad("footway"), 4);
    assert.equal(lampHeightForRoad(null), 6.5);
  });
  it("kelvin from tags and zone", () => {
    assert.equal(kelvinFor({ "light:method": "high_pressure_sodium" }, "Europe/London"), 2000);
    assert.equal(kelvinFor({ "light:method": "LED" }, "Europe/London"), 3000);
    assert.equal(kelvinFor({}, "Africa/Lagos"), 4500);
    assert.equal(kelvinFor(undefined, "Etc/GMT"), 4000);
  });
  it("direction parses degrees and cardinals", () => {
    assert.equal(parseDirection("NE"), 45);
    assert.equal(parseDirection("370"), 10);
    assert.equal(parseDirection("forward"), null);
  });
});

describe("trees", () => {
  it("detects palms by leaf_type, taxon and genus", () => {
    assert.ok(isPalm({ leaf_type: "palm" }));
    assert.ok(isPalm({ taxon: "Arecaceae" }));
    assert.ok(isPalm({ "taxon:family": "Arecaceae" }));
    assert.ok(isPalm({ genus: "Cocos" }));
    assert.ok(isPalm({ species: "Elaeis guineensis" }));
    assert.ok(!isPalm({ genus: "Mangifera" }));
    assert.ok(!isPalm({}));
  });
  it("height tag wins", () => {
    assert.equal(treeSize({ height: "14" }, 1, "Europe/London").heightM, 14);
  });
  it("circumference 2.0 m → DBH ≈ 63.7 cm and a height within the species range", () => {
    const dbh = (2.0 * 100) / Math.PI;
    assert.ok(Math.abs(dbh - 63.66) < 0.1);
    const t = treeSize({ genus: "Platanus", circumference: "2.0" }, 5, "Europe/London");
    assert.ok(t.heightM >= 10 && t.heightM <= 35 * 1.15, `h=${t.heightM}`);
    const small = treeSize({ genus: "Platanus", circumference: "0.5" }, 5, "Europe/London");
    assert.ok(small.heightM < t.heightM, "monotonic in circumference");
  });
  it("is deterministic per id", () => {
    assert.deepEqual(treeSize({}, 42, "Africa/Lagos"), treeSize({}, 42, "Africa/Lagos"));
  });
  it("every zone and species gives a valid shape", () => {
    for (const zone of [...Object.keys(REGIONAL_TREES), "Etc/GMT-1"]) {
      for (let id = 1; id < 40; id += 1) {
        const t = treeSize({}, id, zone);
        assert.ok(["round", "ovoid", "conical", "umbrella", "palm", "columnar"].includes(t.shape));
        assert.ok(t.heightM >= 1 && t.heightM <= 60 && t.crownM > 0 && t.trunkM > 0);
      }
    }
    for (const g of Object.keys(SPECIES)) assert.ok(treeSize({ genus: g }, 3, "fallback").genus === g);
  });
  it("palm via taxon gets palm shape", () => {
    assert.equal(treeSize({ taxon: "Arecaceae" }, 9, "Pacific/Honolulu").shape, "palm");
  });
});
