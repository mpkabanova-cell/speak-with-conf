import type { Pause } from "./types";

export const SAMPLE_RATE = 16000;
export const LONG_PAUSE_SEC = 2;

/** Decode a recorded blob into 16 kHz mono Float32 samples (Whisper input format). */
export async function decodeTo16k(blob: Blob): Promise<{ samples: Float32Array; duration: number }> {
  const buf = await blob.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    void ctx.close();
  }
  const duration = decoded.duration;
  const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE));
  const off = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return { samples: rendered.getChannelData(0).slice(), duration };
}

/**
 * Energy-based voice activity detection.
 * Adaptive threshold from the noise floor of the recording, with hangover smoothing
 * to tolerate short dips inside words. Returns speech segments in seconds.
 */
export function detectSpeech(samples: Float32Array, sr = SAMPLE_RATE) {
  const frame = Math.round(sr * 0.03); // 30 ms
  const n = Math.floor(samples.length / frame);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * frame; j < (i + 1) * frame; j++) sum += samples[j]! * samples[j]!;
    db[i] = 10 * Math.log10(sum / frame + 1e-10);
  }
  if (n === 0) return { segments: [] as [number, number][] };
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.1)]!;
  const peak = sorted[Math.floor(n * 0.98)]!;
  // threshold sits above the noise floor but well below speech peaks
  const thr = Math.max(floor + 9, floor + (peak - floor) * 0.3, -60);

  const voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) voiced[i] = db[i]! > thr ? 1 : 0;

  // hangover: fill gaps shorter than 250 ms, drop blips shorter than 90 ms
  const fillGap = Math.round(0.25 / 0.03);
  const minRun = Math.round(0.09 / 0.03);
  const segs: [number, number][] = [];
  let i = 0;
  while (i < n) {
    if (!voiced[i]) { i++; continue; }
    let j = i;
    while (j < n && voiced[j]) j++;
    if (j - i >= minRun) segs.push([i, j]);
    i = j;
  }
  const merged: [number, number][] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] <= fillGap) last[1] = s[1];
    else merged.push([...s]);
  }
  const t = frame / sr;
  return { segments: merged.map(([a, b]) => [a * t, b * t] as [number, number]) };
}

/** Long pauses between speech segments; leading/trailing silence ignored. */
export function findPauses(segments: [number, number][], minSec = LONG_PAUSE_SEC): Pause[] {
  const pauses: Pause[] = [];
  for (let k = 1; k < segments.length; k++) {
    const start = segments[k - 1]![1];
    const end = segments[k]![0];
    const d = end - start;
    if (d >= minSec) pauses.push({ start: round(start), end: round(end), duration: round(d) });
  }
  return pauses;
}

const round = (x: number) => Math.round(x * 10) / 10;

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function fmtTimer(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export const fmtSec = (s: number) => `${s.toFixed(1).replace(".", ",")} с`;
