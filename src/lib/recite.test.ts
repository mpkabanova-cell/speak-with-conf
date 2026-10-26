import { describe, expect, it } from "vitest";
import { compareRecitation } from "./recite";

describe("compareRecitation", () => {
  it("exact text ignoring case and punctuation is a full match", () => {
    const r = compareRecitation("Мороз и солнце; день чудесный!", "мороз и солнце день чудесный");
    expect([r.total, r.matched, r.missed, r.wrong, r.extra]).toEqual([5, 5, 0, 0, 0]);
  });

  it("marks a skipped word as missed", () => {
    const r = compareRecitation("Мороз и солнце день чудесный", "Мороз и солнце чудесный");
    expect(r.missed).toBe(1);
    expect(r.tokens.find((t) => t.status === "missed")?.text).toBe("день");
  });

  it("marks a substituted word as wrong with what was said", () => {
    const r = compareRecitation("To be or not to be", "To be or not to see");
    const w = r.tokens.find((t) => t.status === "wrong");
    expect(r.wrong).toBe(1);
    expect([w?.text, w?.said]).toEqual(["be", "see"]);
  });

  it("counts an inserted word as extra", () => {
    const r = compareRecitation("Я помню чудное мгновенье", "Я помню ну чудное мгновенье");
    expect(r.extra).toBe(1);
    expect(r.tokens[2]?.extraBefore).toEqual(["ну"]);
  });
});
