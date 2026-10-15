/** Speech word chunks. Pure strings — this module never opens an audio device. */

export function speakChunks(text: string): string[] {
  if (text === "") return [];
  return text.split(" ").filter((word) => word.length > 0);
}

/** NDU-UPG wiring: speak a short street line in 6-word chunks with the browser voice (no server, no GPU).
 *  Only runs on an explicit tap. Returns false when the browser has no speech. */
export function speakLine(text: string, lang = "en-NG"): boolean {
  const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  if (!synth) return false;
  const words = speakChunks(text.slice(0, 240));
  synth.cancel();
  for (let i = 0; i < words.length; i += 6) {
    const u = new SpeechSynthesisUtterance(words.slice(i, i + 6).join(" "));
    u.lang = lang;
    u.rate = 1.02;
    synth.speak(u);
  }
  return true;
}
