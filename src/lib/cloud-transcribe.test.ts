import { describe, it, expect } from "vitest";
import { readTranscript } from "./cloud-transcribe";
describe("transcription stream", () => {
  it("reads split events after metadata and keeps the final transcript", async () => {
    const frames = ['event: ping\ndata: {}\n\n', 'data: {"type":"transcript.text.delta","delta":"Лист', 'ья"}\n\n', 'data: {"type":"transcript.text.done","text":"Листья в поле"}\n\n'];
    const updates: string[] = [];
    const response = new Response(new ReadableStream({ start(controller) {
      for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
      controller.close();
    } }));
    expect(await readTranscript(response, text => updates.push(text))).toBe("Листья в поле");
    expect(updates).toEqual(["Листья", "Листья в поле"]);
  });
  it("rejects an incomplete transcript instead of silently dropping the tail", async () => {
    const response = new Response('data: {"type":"transcript.text.delta","delta":"Листья"}\n\n');
    await expect(readTranscript(response, () => {})).rejects.toThrow("не завершена");
  });
  it("preserves a safe provider denial", async () => {
    const response = Response.json({ error: { message: "Доступ запрещён" } }, { status: 403 });
    await expect(readTranscript(response, () => {})).rejects.toThrow("Доступ запрещён");
  });
});