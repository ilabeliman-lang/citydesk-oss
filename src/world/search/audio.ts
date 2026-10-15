/**
 * NDU-AI voice search: microphone capture that stays on the phone. Records up to a few seconds,
 * decodes the clip and resamples it to 16 kHz mono for Whisper. Nothing is uploaded.
 */
const MAX_MS = 12_000;

export type Clip = { samples: Float32Array; seconds: number };

function pickMime(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Record until `stop()` or the time limit. Resolves null if the mic was blocked. */
export function recordClip(onLevel?: (level: number) => void): { stop: () => void; done: Promise<Clip | null> } {
  let stopped = false;
  let resolveDone: (c: Clip | null) => void = () => undefined;
  const done = new Promise<Clip | null>((resolve) => {
    resolveDone = resolve;
  });
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let timer = 0;

  const finish = async (blob: Blob | null) => {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    window.clearTimeout(timer);
    if (!blob || blob.size < 200) return resolveDone(null);
    try {
      const decoded = await decode(blob);
      resolveDone(decoded);
    } catch {
      resolveDone(null);
    }
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch {
      return resolveDone(null);
    }
    if (stopped) return finish(null);
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => void finish(new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }));
    // A live level meter from the same stream (analysed locally, never sent).
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) * (v - 128);
        onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) / 40));
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // no meter: recording still works
    }
    recorder.start();
    timer = window.setTimeout(() => stop(), MAX_MS);
  })();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else void finish(null);
  };
  return { stop, done };
}

/** Decode a recorded blob to mono 16 kHz float samples. */
export async function decode(blob: Blob): Promise<Clip> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = mixDown(audio);
    const samples = resample(mono, audio.sampleRate, 16000);
    return { samples, seconds: samples.length / 16000 };
  } finally {
    void ctx.close();
  }
}

function mixDown(audio: AudioBuffer): Float32Array {
  const out = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c += 1) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < out.length; i += 1) out[i] += ch[i];
  }
  if (audio.numberOfChannels > 1) for (let i = 0; i < out.length; i += 1) out[i] /= audio.numberOfChannels;
  return out;
}

/** Linear resampling (good enough for speech). */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const n = Math.round((input.length * toRate) / fromRate);
  const out = new Float32Array(n);
  const step = fromRate / toRate;
  for (let i = 0; i < n; i += 1) {
    const x = i * step;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (input[j] ?? 0) * (1 - f) + (input[j + 1] ?? input[j] ?? 0) * f;
  }
  return out;
}
