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

describe("compareRecitation tolerance", () => {
  const src = "Листья в поле пожелтели, И кружатся, и летят; Лишь в бору поникши ели Зелень мрачную хранят.";
  it("speech-recognition slips in long words count as matched", () => {
    const r = compareRecitation(src, "листья в поле пожелтили и кружатся и летят лишь в бору поникши ели зенень мрачную хранят");
    expect([r.matched, r.missed, r.wrong]).toEqual([16, 0, 0]);
  });
  it("exactly two real mistakes give exactly two", () => {
    const r = compareRecitation(src, "листья в поле пожелтели и кружатся и летят лишь в бору ели зелень тёмную хранят");
    expect(r.missed + r.wrong).toBe(2);
  });
  it("a joined word in speech matches two source words", () => {
    const r = compareRecitation("Уж не любит меж цветов", "уж не любит межцветов");
    expect(r.matched).toBe(5);
  });
  it("accepting a word marks it as matched", () => {
    const r = compareRecitation("Мороз и солнце день чудесный", "мороз и солнце чудесный", [3]);
    expect([r.matched, r.missed]).toEqual([5, 0]);
  });
});
