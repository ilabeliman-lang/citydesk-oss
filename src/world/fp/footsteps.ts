// NDU-FP (FPXR-13): footsteps on gait step events (not the Workverse 360 ms metronome).
import { getImmerse } from "@/world/immerse/store";
import { playFootstep } from "@/world/workverse/audio";
import { footstepGate, surfaceFor } from "./surface";

export function playStep(foot: "L" | "R", kind: string, speed: number, footstepsPref: boolean) {
  const s = getImmerse();
  if (!footstepGate({ sound: Boolean(s.sound), footsteps: footstepsPref, active: true })) return;
  const gain = 0.7 + (0.3 * speed) / 3.5;
  const pan = foot === "L" ? -0.12 : 0.12;
  playFootstep(surfaceFor(kind), { pan, gain });
  if ((s.fx?.rain ?? 0) > 0.2 || (s.fx?.wet ?? 0) > 0.5) playFootstep("wet", { pan, gain: gain * 0.5 });
}
