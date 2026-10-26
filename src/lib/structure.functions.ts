import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  type: z.enum(["answer", "retelling", "project"]),
  prompt: z.string().max(500),
  transcript: z.string().min(1).max(20000),
  source_text: z.string().max(20000).nullable().optional(),
});

const OutputSchema = z.object({
  elements: z.array(
    z.object({ name: z.string(), found: z.boolean(), evidence: z.string().nullable(), comment: z.string() }),
  ),
  sequence_issues: z.array(z.string()),
  recommendations: z.array(z.string()),
  summary: z.string(),
});

const CRITERIA: Record<string, string> = {
  answer: `Формат: ответ на учебный вопрос. Элементы (используй ровно эти названия):
"Прямой ответ" — есть ли прямой ответ или основной тезис;
"Объяснение" — объяснена ли основная мысль;
"Аргументы и примеры" — есть ли аргументы или примеры (если уместны);
"Последовательность" — логична ли последовательность;
"Завершённость" — завершён ли ответ, есть ли итог.`,
  retelling: `Формат: пересказ. Не оценивай полноту и достоверность — исходного текста нет. Элементы (ровно эти названия):
"Вступление" — есть ли вступление;
"Последовательность" — последовательно ли изложение;
"Связность" — связаны ли основные мысли;
"Переходы" — логичны ли переходы между частями;
"Завершение" — есть ли завершение.`,
  retelling_source: `Формат: пересказ исходного текста (он приведён ниже). Сравни пересказ с исходником по смыслу, не требуя дословности. Элементы (ровно эти названия):
"Главная мысль" — передана ли главная мысль исходного текста;
"Ключевые события и факты" — названы ли основные события/факты исходника (в comment перечисли пропущенные важные пункты);
"Последовательность" — сохранён ли порядок исходного текста;
"Точность" — нет ли искажений смысла исходника (в comment укажи, что передано неверно);
"Завершение" — есть ли завершение.`,
  project: `Формат: защита учебного проекта. Элементы (ровно эти названия):
"Проблема и актуальность"; "Цель"; "Решение"; "Результаты"; "Вывод".
Если элемент отсутствует — в comment объясни, что именно стоит добавить.`,
};

const SYSTEM = `Ты — доброжелательный тренер по устной речи для школьников 5–11 классов.
Анализируй ТОЛЬКО логическую структуру расшифровки выступления. Правила:
- Не выдумывай содержание: опирайся только на текст. evidence — короткая точная цитата (до 15 слов) из расшифровки или null.
- Не оценивай личность, интеллект, эмоции или уверенность. Не ставь баллы и оценки.
- Не проверяй фактическую правильность знаний (если дан исходный текст — сверяй только с ним).
- Расшифровка сделана автоматически и может содержать ошибки распознавания — не придирайся к ним.
- comment — 1 короткое предложение, понятное школьнику: где найден элемент или что улучшить.
- sequence_issues — 0–3 конкретных нарушения логики (пусто, если нет).
- recommendations — 1–2 конкретные развивающие рекомендации по структуре, обращение на «ты», без сложных терминов.
- summary — одно предложение о структуре.
Пиши по-русски.`;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["elements", "sequence_issues", "recommendations", "summary"],
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
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "anon";
    if (rateLimited(ip)) {
      return { ok: false as const, error: "Слишком много запросов подряд. Подожди минуту и попробуй снова." };
    }
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "ИИ-анализ сейчас не настроен." };

    const text = await callResponses(key, {
      instructions: SYSTEM,
      input: [
        {
          role: "user",
          content: `${CRITERIA[data.type === "retelling" && data.source_text?.trim() ? "retelling_source" : data.type]}\n\nТема/вопрос: ${data.prompt || "(не указана)"}${data.type === "retelling" && data.source_text?.trim() ? `\n\nИсходный текст:\n"""${data.source_text}"""` : ""}\n\nРасшифровка выступления:\n"""${data.transcript}"""`,
        },
      ],
      text: { format: { type: "json_schema", name: "structure", strict: true, schema: JSON_SCHEMA } },
    });
    if (!text.ok) return text;

    try {
      const parsed = OutputSchema.parse(JSON.parse(text.text));
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
