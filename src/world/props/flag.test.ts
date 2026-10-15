import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __setPropsEnv, propsAllowed, propsMode } from "./flag.ts";

const g = globalThis as Record<string, unknown>;
function stub(search: string, store: Record<string, string> = {}) {
  g.location = { search };
  g.localStorage = { getItem: (k: string) => store[k] ?? null };
}

describe("props flag", () => {
  afterEach(() => {
    __setPropsEnv(undefined);
    delete g.location;
    delete g.localStorage;
  });
  it("defaults to off", () => {
    __setPropsEnv("");
    assert.equal(propsMode(), "off");
    stub("");
    assert.equal(propsAllowed(), false);
  });
  it("junk env is off", () => {
    __setPropsEnv("yes please");
    assert.equal(propsMode(), "off");
  });
  it("?props=1 forces on even when off", () => {
    __setPropsEnv("off");
    stub("?props=1");
    assert.equal(propsAllowed(), true);
  });
  it("?props=0 forces off even when on", () => {
    __setPropsEnv("on");
    stub("?props=0");
    assert.equal(propsAllowed(), false);
  });
  it("beta needs ?props=1", () => {
    __setPropsEnv("beta");
    stub("");
    assert.equal(propsAllowed(), false);
    stub("?x=1&props=1");
    assert.equal(propsAllowed(), true);
  });
  it("localStorage off beats on mode, but not ?props=1", () => {
    __setPropsEnv("on");
    stub("", { "ndu.props.off": "1" });
    assert.equal(propsAllowed(), false);
    stub("?props=1", { "ndu.props.off": "1" });
    assert.equal(propsAllowed(), true);
    stub("", {});
    assert.equal(propsAllowed(), true);
  });
});
