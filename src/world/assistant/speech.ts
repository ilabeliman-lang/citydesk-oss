/**
 * NDU-AI avatar-bot assistant: voice out. Browser SpeechSynthesis only (free, on-device, no audio files,
 * nothing leaves the phone). Text is spoken sentence by sentence as it arrives so long replies start
 * talking straight away. Muted by default on first load (the player turns it on). No Kokoro/Piper path:
 * the studio gateway serves no TTS model today.
 */
type Listener = (speaking: boolean) => void;

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export function createVoice(onSpeaking: Listener) {
  const synth =
    typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  let queued = 0;
  let voice: SpeechSynthesisVoice | null = null;
  const pick = () => {
    if (!synth || voice) return;
    const all = synth.getVoices();
    voice =
      all.find(
        (v) =>
          /en[-_](NG|GB)/i.test(v.lang) &&
          /female|zira|libby|sonia|serena|google uk english female/i.test(v.name),
      ) ??
      all.find((v) => /^en/i.test(v.lang)) ??
      null;
  };
  synth?.addEventListener?.("voiceschanged", pick);
  return {
    supported: Boolean(synth),
    /** Queue text (one or more sentences). */
    say(text: string) {
      if (!synth) return;
      pick();
      for (const part of splitSentences(text.slice(0, 600))) {
        const u = new SpeechSynthesisUtterance(part);
        if (voice) u.voice = voice;
        u.rate = 1.04;
        u.pitch = 1.15;
        u.onstart = () => onSpeaking(true);
        u.onend = u.onerror = () => {
          queued = Math.max(0, queued - 1);
          if (!queued) onSpeaking(false);
        };
        queued += 1;
        synth.speak(u);
      }
    },
    stop() {
      if (!synth) return;
      queued = 0;
      synth.cancel();
      onSpeaking(false);
    },
  };
}
