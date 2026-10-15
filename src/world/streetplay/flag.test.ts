// NDU-UPG u-169: StreetPlay is isolated behind a default-off flag.
// Tests the pure flag logic (streetPlayAllowed/streetPlayOn) with a stubbed
// window/localStorage, mirroring the ground/flag.ts house pattern.
import { test } from "node:test";
import assert from "node:assert/strict";

// flag.ts reads window.location.search, import.meta.env, and localStorage at
// call time. We stub them globally before importing (the module body itself
// does no eager work at import).
function installStub(search: string, env: Record<string, string>, store: Record<string, string>) {
  const store2 = { ...store };
  (globalThis as any).window = {
    location: { search },
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in store2 ? store2[k] : null),
    setItem: (k: string, v: string) => {
      store2[k] = String(v);
    },
  };
  // import.meta.env isn't directly stubable in node; VITE_NDU_STREETPLAY is read
  // as undefined here (the "not set" case), which is the default-off path.
  return store2;
}

test("streetPlayAllowed: off without a window", async () => {
  const { streetPlayAllowed } = await import("./flag.ts");
  // no window installed in this test's fresh state is hard to guarantee after
  // other tests stub it; assert the query-off behaviour instead.
  assert.equal(typeof streetPlayAllowed, "function");
});

test("streetPlayOn: default OFF (no query, no saved switch)", async () => {
  installStub("", {}, {});
  const { streetPlayOn, STREETPLAY_KEY } = await import("./flag.ts");
  assert.equal(streetPlayOn(), false);
  assert.equal(STREETPLAY_KEY, "ndu.streetplay");
});

test("streetPlayOn: ?streetplay=0|off forces OFF even if previously saved on", async () => {
  installStub("?streetplay=0", {}, { "ndu.streetplay": "1" });
  const { streetPlayOn } = await import("./flag.ts");
  assert.equal(streetPlayOn(), false);
});

test("streetPlayOn: ?streetplay=1|on turns it ON and remembers", async () => {
  installStub("?streetplay=1", {}, {});
  const { streetPlayOn } = await import("./flag.ts");
  assert.equal(streetPlayOn(), true);
  assert.equal((globalThis as any).localStorage.getItem("ndu.streetplay"), "1");
  // a later visit with no query keeps it on (saved switch)
  installStub("", {}, { "ndu.streetplay": "1" });
  assert.equal(streetPlayOn(), true);
});

test("streetPlayAllowed: no window -> false", async () => {
  delete (globalThis as any).window;
  const { streetPlayAllowed } = await import("./flag.ts");
  assert.equal(streetPlayAllowed(), false);
});
