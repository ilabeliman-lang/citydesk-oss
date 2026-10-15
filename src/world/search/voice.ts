/**
 * NDU-AI voice search (page side): on-device Whisper tiny in the model worker. The recorded samples
 * are handed to the worker in memory and transcribed in this browser; no audio goes to any server.
 */
import { VOICE_MODEL } from "./models";
import { call } from "./worker";

let ready = false;
let loading: Promise<void> | null = null;

export function voiceReady(): boolean {
  return ready;
}

export function loadVoice(onProgress?: (ratio: number) => void): Promise<void> {
  if (ready) return Promise.resolve();
  loading ??= call({ op: "load", task: "asr", model: VOICE_MODEL.id }, onProgress).then(
    () => {
      ready = true;
    },
    (err) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

/** Transcribe one mono 16 kHz clip. */
export async function transcribe(audio16k: Float32Array): Promise<string> {
  await loadVoice();
  const res = await call({ op: "asr", model: VOICE_MODEL.id, audio: audio16k }, undefined, [audio16k.buffer]);
  return String(res.text ?? "");
}
