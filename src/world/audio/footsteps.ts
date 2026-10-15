/** Surface footstep voice. Pure numbers — this module never opens an audio device. */

export type Surface = "asphalt" | "stone" | "grass" | "wood";

export type StepVoice = {
  hz: number;
  gain: number;
  ms: number;
};

/** Harder ground rings higher and shorter. Grass stays the quietest. */
const VOICE: Record<Surface, { hz: number; gain: number; ms: number }> = {
  asphalt: { hz: 92, gain: 0.34, ms: 68 },
  stone: { hz: 148, gain: 0.52, ms: 46 },
  grass: { hz: 64, gain: 0.16, ms: 96 },
  wood: { hz: 118, gain: 0.4, ms: 74 },
};

/** Left and right feet sit a few hertz apart so a walk does not drone. */
const STEP_HZ = 5;

/** What the street sounds like underfoot. Unknown roads stay asphalt. */
export function stepSurface(kind: string): Surface {
  if (kind === "steps") return "stone";
  if (kind === "path" || kind === "track") return "grass";
  if (kind === "wood") return "wood";
  return "asphalt";
}

export function footstep(surface: Surface, step: number): StepVoice {
  const voice = VOICE[surface];
  const side = Math.abs(Math.trunc(step)) % 2 === 0 ? -1 : 1;
  return {
    hz: voice.hz + side * STEP_HZ,
    gain: voice.gain,
    ms: voice.ms,
  };
}
