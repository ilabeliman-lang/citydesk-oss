import assert from "node:assert/strict";
import { nearestDoor } from "./entrances.ts";

assert.equal(nearestDoor({ x: 0, y: 0 }, []), null, "empty doors returns null");

assert.equal(
  nearestDoor({ x: 0, y: 0 }, [{ id: "only", x: 4, y: 0 }]),
  "only",
);

assert.equal(
  nearestDoor({ x: 0, y: 0 }, [
    { id: "far", x: 10, y: 0 },
    { id: "near", x: 1, y: 1 },
    { id: "mid", x: 4, y: 3 },
  ]),
  "near",
  "returns the id of the nearer door",
);

assert.equal(
  nearestDoor({ x: 3, y: -2 }, [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 3, y: -2 },
  ]),
  "b",
  "a door under the point wins",
);

assert.equal(
  nearestDoor({ x: 0, y: 0 }, [
    { id: "west", x: -2, y: 0 },
    { id: "east", x: 2, y: 0 },
  ]),
  "west",
  "equal distance keeps the earlier door",
);

assert.equal(
  nearestDoor({ x: 0, y: 0 }, [
    { id: "axis", x: 6, y: 0 },
    { id: "diag", x: 3, y: 4 },
  ]),
  "diag",
  "compares true distance, not axis distance",
);

assert.equal(
  nearestDoor({ x: -8, y: 5 }, [
    { id: "hall", x: 2, y: 2 },
    { id: "shop", x: -7, y: 6 },
  ]),
  "shop",
);

console.log("entrances ok");
