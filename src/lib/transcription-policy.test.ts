import { describe, it, expect } from "vitest";
import { canUploadAudio, TRANSCRIPTION_MODEL } from "./transcription-policy";
describe("cloud recitation consent", () => {
  it("uses the requested GPT Transcribe model", () => expect(TRANSCRIPTION_MODEL).toBe("openai/gpt-transcribe"));
  it("never uploads memorize audio without consent", () => expect(canUploadAudio("memorize", false)).toBe(false));
  it("uploads memorize only after consent", () => expect(canUploadAudio("memorize", true)).toBe(true));
  it.each(["answer", "retelling", "project"] as const)("keeps %s local", type => expect(canUploadAudio(type, true)).toBe(false));
});