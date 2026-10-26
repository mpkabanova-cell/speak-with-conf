/// <reference lib="webworker" />
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { withQuietTail } from "./local-transcription";

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let asrAccurate = false;
let deviceUsed: "webgpu" | "wasm" = "wasm";

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function hasWebGPU() {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load(accurate: boolean) {
  if (asr && (asrAccurate || !accurate)) return asr;
  asr = null;
  const progress_callback = (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
    if (p.status === "progress") post({ type: "load-progress", file: p.file, loaded: p.loaded, total: p.total });
  };
  if (await hasWebGPU()) {
    try {
      asr = (await pipeline("automatic-speech-recognition", "onnx-community/whisper-small", {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        progress_callback,
      })) as AutomaticSpeechRecognitionPipeline;
      deviceUsed = "webgpu";
      asrAccurate = true;
      return asr;
    } catch {
      asr = null;
    }
  }
  asr = (await pipeline("automatic-speech-recognition", accurate ? "onnx-community/whisper-small" : "onnx-community/whisper-base", {
    device: "wasm",
    dtype: "q8",
    progress_callback,
  })) as AutomaticSpeechRecognitionPipeline;
  deviceUsed = "wasm";
  asrAccurate = accurate;
  return asr;
}

self.onmessage = async (e: MessageEvent<{ type: "transcribe"; samples: Float32Array; language?: string; accurate?: boolean }>) => {
  if (e.data.type !== "transcribe") return;
  try {
    post({ type: "status", status: "loading" });
    const model = await load(!!e.data.accurate);
    post({ type: "status", status: "transcribing", device: deviceUsed });
    const out = (await model(withQuietTail(e.data.samples), {
      language: e.data.language || "russian",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })) as { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] };
    post({
      type: "done",
      text: out.text.trim(),
      chunks: (out.chunks ?? []).map((c) => ({ text: c.text, start: Math.min(c.timestamp[0], e.data.samples.length / 16000), end: c.timestamp[1] == null ? null : Math.min(c.timestamp[1], e.data.samples.length / 16000) })),
      device: deviceUsed,
    });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
