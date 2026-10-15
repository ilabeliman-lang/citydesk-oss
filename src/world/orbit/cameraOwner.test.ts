import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraOwner, claimCamera, fpOwns, onCameraOwner, pitchCapFor, releaseCamera, setFpPitchCap } from "./cameraOwner.ts";

test("default owner is follow and FP does not own", () => {
  assert.equal(cameraOwner(), "follow");
  assert.equal(fpOwns(), false);
});
test("claim / release; release by a non-owner is ignored", () => {
  const seen: string[] = [];
  const off = onCameraOwner((o) => seen.push(o));
  claimCamera("handoff");
  assert.equal(fpOwns(), true);
  claimCamera("fp");
  releaseCamera("handoff");
  assert.equal(cameraOwner(), "fp");
  releaseCamera("fp");
  assert.equal(cameraOwner(), "follow");
  off();
  claimCamera("fp");
  assert.deepEqual(seen, ["handoff", "fp", "follow"]);
  releaseCamera("fp");
});
test("pitchCapFor: today's caps when FP inactive, FP cap when active", () => {
  setFpPitchCap({ min: 20, max: 160 });
  assert.deepEqual(pitchCapFor("A"), { min: 0, max: 85 });
  assert.deepEqual(pitchCapFor("C"), { min: 0, max: 60 });
  claimCamera("fp");
  assert.deepEqual(pitchCapFor("A"), { min: 20, max: 160 });
  releaseCamera("fp");
  setFpPitchCap(null);
  assert.deepEqual(pitchCapFor("B"), { min: 0, max: 85 });
});
