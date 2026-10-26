import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { analysisInputSchema, analysisInstructions, buildAnalysisInput, validateAnalysis } from "./subject-analysis";

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["elements", "sequence_issues", "recommendations", "summary", "accuracy"],
  properties: {
    elements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "found", "evidence", "comment"],
        properties: {
          name: { type: "string" },
          found: { type: "boolean" },
          evidence: { type: ["string", "null"] },
          comment: { type: "string" },
        },
      },
    },
    sequence_issues: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    accuracy: {
      type: "object", additionalProperties: false,
      required: ["basis", "summary", "findings"],
      properties: {
        basis: { type: "string", enum: ["source", "general_knowledge"] },
        summary: { type: "string" },
        findings: { type: "array", items: {
          type: "object", additionalProperties: false,
          required: ["status", "quote", "explanation", "correction", "source_quote"],
          properties: {
            status: { type: "string", enum: ["error", "uncertain"] },
            quote: { type: "string" }, explanation: { type: "string" },
            correction: { type: ["string", "null"] }, source_quote: { type: ["string", "null"] },
          },
        } },
      },
    },
  },
};

// Best-effort per-instance rate limit
const hits = new Map<string, number[]>();
function rateLimited(key: string) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 6) return true;
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

export const analyzeStructure = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => analysisInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "anon";
    if (rateLimited(ip)) {
      return { ok: false as const, error: "Слишком много запросов подряд. Подожди минуту и попробуй снова." };
    }
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "ИИ-анализ сейчас не настроен." };

    const text = await callResponses(key, {
      instructions: analysisInstructions,
      input: [
        {
          role: "user",
          content: buildAnalysisInput(data),
        },
      ],
      text: { format: { type: "json_schema", name: "structure", strict: true, schema: JSON_SCHEMA } },
    });
    if (!text.ok) return text;

    try {
      const parsed = validateAnalysis(JSON.parse(text.text), data);
      return { ok: true as const, result: parsed };
    } catch {
      return { ok: false as const, error: "ИИ вернул неполный ответ. Попробуй ещё раз." };
    }
  });

type Fail = { ok: false; error: string };

async function callResponses(key: string, req: Record<string, unknown>): Promise<{ ok: true; text: string } | Fail> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" }, ...req }),
  });
  if (!res.ok || !res.body) {
    const msg =
      res.status === 429
        ? "ИИ-сервис перегружен. Попробуй ещё раз через минуту."
        : res.status === 402
          ? "Закончился лимит ИИ-анализа. Обратись к владельцу сервиса."
          : "ИИ-сервис временно недоступен. Попробуй позже.";
    console.error("ai gateway failed", res.status);
    return { ok: false, error: msg };
  }
  let text = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error") return { ok: false, error: "ИИ-сервис не смог выполнить запрос. Попробуй позже." };
      } catch {
        /* ignore partial */
      }
    }
  }
  return { ok: true, text };
}

async function guard(): Promise<{ ok: true; key: string } | Fail> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "anon";
  if (rateLimited(ip)) return { ok: false, error: "Слишком много запросов подряд. Подожди минуту и попробуй снова." };
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false, error: "ИИ-сервис сейчас не настроен." };
  return { ok: true, key };
}

const ExtractInput = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  filename: z.string().max(200),
  data: z.string().min(10).max(12_000_000),
});

const LANG_CODES = ["russian", "english", "german", "french", "spanish", "italian"] as const;
const ExtractOutput = z.object({ text: z.string(), language: z.enum(LANG_CODES) });

/** Reads the text from a photo or PDF verbatim, so the student can check it against their speech. */
export const extractSourceText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }) => {
    const g = await guard();
    if (!g.ok) return g;
    const file =
      data.mime === "application/pdf"
        ? { type: "input_file", filename: data.filename || "file.pdf", file_data: `data:application/pdf;base64,${data.data}` }
        : { type: "input_image", image_url: `data:${data.mime};base64,${data.data}` };
    const r = await callResponses(g.key, {
      instructions:
        "Ты распознаёшь текст. Перепиши основной текст с изображения или документа ДОСЛОВНО: тот же язык, те же слова, порядок и переносы строк. Ничего не исправляй, не переводи, не сокращай и не добавляй. Пропусти номера страниц, колонтитулы и подписи к картинкам. Если текста нет — верни пустую строку. language — язык текста.",
      input: [{ role: "user", content: [{ type: "input_text", text: "Перепиши текст дословно." }, file] }],
      text: {
        format: {
          type: "json_schema",
          name: "source",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["text", "language"],
            properties: { text: { type: "string" }, language: { type: "string", enum: [...LANG_CODES] } },
          },
        },
      },
    });
    if (!r.ok) return r;
    try {
      const out = ExtractOutput.parse(JSON.parse(r.text));
      if (!out.text.trim()) return { ok: false as const, error: "На файле не удалось найти текст. Попробуй более чёткое фото." };
      return { ok: true as const, result: out };
    } catch {
      return { ok: false as const, error: "Не удалось распознать текст. Попробуй ещё раз." };
    }
  });
