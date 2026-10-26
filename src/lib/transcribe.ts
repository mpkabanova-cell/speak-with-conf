import type { TranscriptChunk } from "./types";

export type TranscribeProgress =
  | { stage: "loading"; percent: number | null }
  | { stage: "transcribing"; device?: string };

let worker: Worker | null = null;
function getWorker() {
  worker ??= new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

export function transcribe(
  samples: Float32Array,
  onProgress: (p: TranscribeProgress) => void,
  language = "russian",
): Promise<{ text: string; chunks: TranscriptChunk[] }> {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    return Promise.reject(new Error("Этот браузер не поддерживает локальное распознавание речи. Попробуй свежую версию Chrome, Edge или Safari."));
  }
  const w = getWorker();
  const files = new Map<string, { loaded: number; total: number }>();
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "load-progress" && m.file && m.total) {
        files.set(m.file, { loaded: m.loaded ?? 0, total: m.total });
        let l = 0, t = 0;
        files.forEach((f) => { l += f.loaded; t += f.total; });
        onProgress({ stage: "loading", percent: t ? Math.round((l / t) * 100) : null });
      } else if (m.type === "status") {
        onProgress(m.status === "loading" ? { stage: "loading", percent: null } : { stage: "transcribing", device: m.device });
      } else if (m.type === "done") {
        w.removeEventListener("message", onMsg);
        resolve({ text: m.text, chunks: m.chunks });
      } else if (m.type === "error") {
        w.removeEventListener("message", onMsg);
        reject(new Error(m.message));
      }
    };
    w.addEventListener("message", onMsg);
    w.onerror = (ev) => {
      w.removeEventListener("message", onMsg);
      worker = null;
      reject(new Error(ev.message || "Не удалось запустить распознавание"));
    };
    const copy = samples.slice();
    w.postMessage({ type: "transcribe", samples: copy, language }, [copy.buffer]);
  });
}
