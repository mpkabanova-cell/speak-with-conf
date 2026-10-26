import type { PracticeType, LanguageCode } from "./types";

export const TRANSCRIPTION_MODEL = "openai/gpt-transcribe";
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
export const AUDIO_SEGMENT_SECONDS = 120;
export const LANGUAGE_ISO: Record<LanguageCode, string> = {
  russian: "ru", english: "en", german: "de", french: "fr", spanish: "es", italian: "it",
};
export function canUploadAudio(type: PracticeType, consent: boolean) {
  return type === "memorize" && consent;
}