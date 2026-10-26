import { describe, expect, it } from "vitest";
import { analysisInputSchema, buildAnalysisInput, supportsSubjectAccuracy, validateAnalysis } from "./subject-analysis";

const input = { type: "project" as const, prompt: "Очистка воды", source_text: "Сначала фильтрация. Затем кипячение. Участвовало 10 учеников.", transcript: "Участвовало 20 учеников." };
function output() {
  return { elements: [], sequence_issues: [], recommendations: [], summary: "", accuracy: { basis: "source", summary: "", findings: [{ status: "error", quote: "20 учеников", explanation: "Количество отличается", correction: "10 учеников", source_quote: "10 учеников" }] } };
}
describe("Subject accuracy rules", () => {
  it.each(["answer", "retelling", "project"] as const)("checks %s", type => expect(supportsSubjectAccuracy(type)).toBe(true));
  it("excludes memorize", () => {
    expect(supportsSubjectAccuracy("memorize")).toBe(false);
    expect(analysisInputSchema.safeParse({ ...input, type: "memorize" }).success).toBe(false);
  });
  it("preserves project source content and order", () => {
    expect(buildAnalysisInput(input)).toContain(input.source_text);
    expect(buildAnalysisInput(input)).toContain(input.transcript);
  });
  it("validates concrete discrepancy against project source", () => expect(validateAnalysis(output(), input).accuracy.findings[0]?.correction).toBe("10 учеников"));
  it("rejects invented transcript evidence", () => {
    const result = output();
    const finding = result.accuracy.findings[0];
    if (!finding) throw new Error("Missing fixture");
    finding.quote = "30 учеников";
    expect(() => validateAnalysis(result, input)).toThrow("Invalid transcript quote");
  });
  it("rejects invented source evidence", () => {
    const result = output();
    const finding = result.accuracy.findings[0];
    if (!finding) throw new Error("Missing fixture");
    finding.source_quote = "5 учеников";
    expect(() => validateAnalysis(result, input)).toThrow("Invalid source quote");
  });
  it("rejects source contradictions without evidence", () => {
    const result = { ...output(), accuracy: { ...output().accuracy, findings: [{ ...output().accuracy.findings[0], source_quote: null }] } };
    expect(() => validateAnalysis(result, input)).toThrow("Missing source evidence");
  });
  it("accepts general knowledge without pretending a reference was supplied", () => {
    const result = { ...output(), accuracy: { basis: "general_knowledge", summary: "", findings: [] } };
    expect(validateAnalysis(result, { ...input, source_text: null }).accuracy.basis).toBe("general_knowledge");
  });
});