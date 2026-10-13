import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  type: z.enum(["answer", "retelling", "project"]),
  prompt: z.string().max(500),
  transcript: z.string().min(1).max(20000),
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
  project: `Формат: защита учебного проекта. Элементы (ровно эти названия):
"Проблема и актуальность"; "Цель"; "Решение"; "Результаты"; "Вывод".
Если элемент отсутствует — в comment объясни, что именно стоит добавить.`,
};

const SYSTEM = `Ты — доброжелательный тренер по устной речи для школьников 5–11 классов.
Анализируй ТОЛЬКО логическую структуру расшифровки выступления. Правила:
- Не выдумывай содержание: опирайся только на текст. evidence — короткая точная цитата (до 15 слов) из расшифровки или null.
- Не оценивай личность, интеллект, эмоции или уверенность. Не ставь баллы и оценки.
- Не проверяй фактическую правильность знаний.
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: SYSTEM,
        input: [
          {
            role: "user",
            content: `${CRITERIA[data.type]}\n\nТема/вопрос: ${data.prompt || "(не указана)"}\n\nРасшифровка выступления:\n"""${data.transcript}"""`,
          },
        ],
        text: { format: { type: "json_schema", name: "structure", strict: true, schema: JSON_SCHEMA } },
      }),
    });

    if (!res.ok || !res.body) {
      const msg =
        res.status === 429
          ? "ИИ-сервис перегружен. Попробуй ещё раз через минуту."
          : res.status === 402
            ? "Закончился лимит ИИ-анализа. Обратись к владельцу сервиса."
            : "ИИ-сервис временно недоступен. Показатели записи сохранены — попробуй позже.";
      console.error("structure analysis failed", res.status);
      return { ok: false as const, error: msg };
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
          if (ev.type === "response.failed" || ev.type === "error") {
            return { ok: false as const, error: "ИИ-сервис не смог выполнить анализ. Попробуй позже." };
          }
        } catch {
          /* ignore partial */
        }
      }
    }

    try {
      const parsed = OutputSchema.parse(JSON.parse(text));
      return { ok: true as const, result: parsed };
    } catch {
      return { ok: false as const, error: "ИИ вернул неполный ответ. Попробуй ещё раз." };
    }
  });
