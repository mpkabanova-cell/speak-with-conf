import { MAX_AUDIO_BYTES, MAX_BODY_BYTES, TRANSCRIPTION_MODEL } from "./transcription-policy";

export async function boundedForm(request: Request): Promise<FormData> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new Error("UPLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("EMPTY_UPLOAD");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("UPLOAD_TOO_LARGE"); }
    chunks.push(new Uint8Array(value));
  }
  return new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: new Blob(chunks) }).formData();
}

// Adapted from the speech-to-text shared multipart helper; credentials remain server-only.
export async function transcribeAudio(file: File, language: string, apiKey: string, signal: AbortSignal) {
  if (!file.size || file.size > MAX_AUDIO_BYTES || !file.type.startsWith("audio/")) throw new Error("INVALID_AUDIO");
  const form = new FormData();
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("file", file, file.name);
  form.append("response_format", "json");
  form.append("stream", "true");
  form.append("languages", language);
  form.append("prompt", "Дословная запись чтения вслух. Сохраняйте произнесённые слова, повторы и ошибки. Не дописывайте стихотворение по памяти и не добавляйте несказанные слова.");
  return fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" }, body: form, signal,
  });
}