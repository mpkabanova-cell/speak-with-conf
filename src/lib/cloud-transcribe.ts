import { createParser } from "eventsource-parser";
import { encodeWav } from "./wav";
import { AUDIO_SEGMENT_SECONDS, LANGUAGE_ISO, canUploadAudio } from "./transcription-policy";
import type { LanguageCode, PracticeType, TranscriptChunk } from "./types";

function errorMessage(value: unknown): string {
  if (typeof value !== "object" || !value) return "Облачное распознавание не удалось.";
  const v = value as { message?: string; error?: { message?: string } };
  return v.error?.message ?? v.message ?? "Облачное распознавание не удалось.";
}

export async function readTranscript(response: Response, onText: (text: string) => void): Promise<string> {
  if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => ({}))));
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Сервис не вернул расшифровку.");
  let text = "", complete = false, failure: string | null = null;
  const parser = createParser({ onEvent: (event) => {
    if (event.data === "[DONE]") return;
    try {
      const data = JSON.parse(event.data);
      const type = data.type ?? event.event;
      if (type === "error" || data.error) failure = errorMessage(data);
      else if (type === "transcript.text.delta") { text += data.delta ?? ""; onText(text); }
      else if (type === "transcript.text.done") { text = data.text ?? text; complete = true; onText(text); }
    } catch { failure = "Не удалось прочитать ответ сервиса."; }
  } });
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
    if (failure) { await reader.cancel(); throw new Error(failure); }
  }
  parser.feed(decoder.decode());
  if (failure) throw new Error(failure);
  if (!complete || !text.trim()) throw new Error("Расшифровка не завершена. Запись сохранена, повтори запрос вручную.");
  return text.trim();
}

export async function cloudTranscribe(samples: Float32Array, language: LanguageCode, type: PracticeType, consent: boolean, onText: (text: string) => void): Promise<{ text: string; chunks: TranscriptChunk[] }> {
  if (!canUploadAudio(type, consent)) throw new Error("Нужно согласие на отправку аудио.");
  const segmentSize = AUDIO_SEGMENT_SECONDS * 16000;
  const texts: string[] = [];
  for (let offset = 0; offset < samples.length; offset += segmentSize) {
    const wav = encodeWav([samples.subarray(offset, offset + segmentSize)], 16000);
    const form = new FormData();
    form.append("file", wav, "recording.wav"); form.append("language", LANGUAGE_ISO[language]);
    form.append("consent", "yes"); form.append("mode", "memorize");
    const response = await fetch("/api/public/transcribe", { method: "POST", body: form });
    texts.push(await readTranscript(response, partial => onText([...texts, partial].join(" "))));
  }
  return { text: texts.join(" "), chunks: [] }; // No source-audio timestamps are supplied by this model.
}