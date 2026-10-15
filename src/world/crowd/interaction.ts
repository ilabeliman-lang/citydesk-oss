import type { WalkerAgent } from "./types.ts";

export type GreetingContext = "honolulu" | "portharcourt" | "lagos" | "default";

export const GREETINGS_BY_REGION: Record<GreetingContext, string[]> = {
  honolulu: ["Aloha!", "Howzit!", "Shoots!", "Good morning!"],
  portharcourt: ["How far!", "Kedu!", "I greet you!", "Good day!"],
  lagos: ["Bawo ni!", "Kedu!", "Bless you!", "How body!"],
  default: ["Hello there!", "Good day!", "Hi!", "Peace!"],
};

/**
 * Checks if a walker is close enough to the player to wave hello.
 * Distance threshold ~4.0m.
 */
export function checkGreetingProximity(
  agent: WalkerAgent,
  playerPos: { lat: number; lng: number },
  radiusM = 4.0
): { shouldGreet: boolean; distanceM: number } {
  const dLat = (agent.pos.lat - playerPos.lat) * 111139;
  const dLng = (agent.pos.lng - playerPos.lng) * 111139 * Math.cos((playerPos.lat * Math.PI) / 180);
  const distanceM = Math.sqrt(dLat * dLat + dLng * dLng);

  return {
    shouldGreet: distanceM <= radiusM && agent.mood !== "waving",
    distanceM,
  };
}

/**
 * Returns a culturally appropriate greeting line for the regional context.
 */
export function getGreetingLine(region: GreetingContext, indexSeed = 0): string {
  const pool = GREETINGS_BY_REGION[region] ?? GREETINGS_BY_REGION.default;
  const idx = Math.abs(indexSeed) % pool.length;
  return pool[idx];
}

/**
 * Trigger wave hello animation state on walker.
 */
export function triggerWaveHello(agent: WalkerAgent, durationSeconds = 3.0): void {
  agent.mood = "waving";
  agent.waveTimerSeconds = durationSeconds;
}

/**
 * Update walker interaction timer.
 */
export function stepInteractionTimer(agent: WalkerAgent, dtSeconds: number): void {
  if (agent.waveTimerSeconds && agent.waveTimerSeconds > 0) {
    agent.waveTimerSeconds -= dtSeconds;
    if (agent.waveTimerSeconds <= 0) {
      agent.waveTimerSeconds = 0;
      agent.mood = "walking";
    }
  }
}
