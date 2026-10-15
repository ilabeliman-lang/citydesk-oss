/**
 * NDU-AI avatar-bot assistant: persona. One named bot with a small set of moods; the avatar's CSS
 * animation follows the mood. Every reply is labelled as AI in the UI.
 */
export const PERSONA = Object.freeze({
  name: "Ada",
  role: "your NDU city guide bot",
  /** Shown under every reply: the provenance label (AI-generated, can be wrong). */
  aiLabel: "AI guide · can be wrong",
});

export type Mood =
  "idle" | "listening" | "thinking" | "happy" | "speaking" | "concerned" | "sleepy";

export type BotEvent =
  | "open"
  | "close"
  | "typing"
  | "sent"
  | "ok"
  | "blocked"
  | "error"
  | "speak"
  | "quiet"
  | "idle-long";

/** Mood after an event (pure; the UI decays back to idle). */
export function nextMood(current: Mood, event: BotEvent): Mood {
  switch (event) {
    case "open":
      return "happy";
    case "close":
      return "idle";
    case "typing":
      return "listening";
    case "sent":
      return "thinking";
    case "ok":
      return "happy";
    case "blocked":
    case "error":
      return "concerned";
    case "speak":
      return "speaking";
    case "quiet":
      return current === "speaking" ? "idle" : current;
    case "idle-long":
      return "sleepy";
  }
}

export function greeting(nickname: string, hour: number): string {
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const who = nickname ? `, ${nickname}` : "";
  return `${part}${who}! I'm ${PERSONA.name}, ${PERSONA.role}. Ask me to fly somewhere, find a building, explain the view, change the weather or start a scan.`;
}
