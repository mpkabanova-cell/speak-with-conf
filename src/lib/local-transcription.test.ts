import { describe, expect, it } from "vitest";
import { completeTranscript, withQuietTail } from "./local-transcription";

describe("Local recording completeness", () => {
  it("preserves every recorded sample and appends one second of silence", () => {
    const original = new Float32Array([0.3, -0.5, 0.7]);
    const padded = withQuietTail(original);
    expect(padded.length).toBe(16003);
    expect(Array.from(padded.slice(0, 3))).toEqual(Array.from(original));
    expect(padded.slice(3).every(value => value === 0)).toBe(true);
    expect(original.length).toBe(3);
  });
  it("does not lose the last word when timestamp chunks are incomplete", () => {
    expect(completeTranscript({ text: "Сложить с одинаковым знаменателем.", chunks: [{ text: "Сложить с одинаковым" }] })).toBe("Сложить с одинаковым знаменателем.");
  });
});