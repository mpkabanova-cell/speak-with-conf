import { countWords, fillerFrequency, findFillers } from "./fillers";
import { fmtSec, fmtTime } from "./audio-analysis";
import { compareRecitation } from "./recite";
import type { Attempt, Practice, Recommendation } from "./types";

export function textMetrics(transcript: string, durationMs: number) {
  const word_count = countWords(transcript);
  const minutes = durationMs / 60000;
  const speech_rate = minutes > 0 ? Math.round(word_count / minutes) : 0;
  return { word_count, speech_rate, filler_words: findFillers(transcript) };
}

export function hashText(t: string) {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Recommendations grounded in measured speech data (fillers, pauses, duration). */
export function speechRecommendations(a: Attempt, p: Practice): Recommendation[] {
  const out: Recommendation[] = [];
  if (p.type === "memorize" && p.source_text && a.transcript) {
    const r = compareRecitation(p.source_text, a.transcript);
    const firstMiss = r.tokens.findIndex((t) => t.status === "missed");
    if (r.missed) {
      const before = r.tokens.slice(Math.max(0, firstMiss - 3), firstMiss).map((t) => t.text).join(" ");
      out.push({
        source: "speech",
        text: `Пропущено слов: ${r.missed}. Первый пропуск — «${r.tokens[firstMiss]!.text}»${before ? ` после «${before}»` : ""}. Повтори этот фрагмент отдельно несколько раз.`,
      });
    }
    const wrongs = r.tokens.filter((t) => t.status === "wrong").slice(0, 2);
    if (wrongs.length) {
      out.push({
        source: "speech",
        text: `Сказано иначе: ${wrongs.map((t) => `«${t.said}» вместо «${t.text}»`).join(", ")}${r.wrong > 2 ? ` и ещё ${r.wrong - 2}` : ""}. Проговори эти места медленно, глядя в текст.`,
      });
    }
  }
  const freq = fillerFrequency(a.filler_words ?? []);
  const f = freq[0];
  if (f && f.count >= 2) {
    out.push({
      source: "speech",
      text: `Слово «${f.word}» встретилось ${f.count} ${plural(f.count, "раз", "раза", "раз")}. Перед следующей мыслью сделай короткий вдох вместо заполнителя — тишина звучит увереннее.`,
    });
  }
  const pauses = a.pauses ?? [];
  if (pauses.length) {
    const longest = pauses.reduce((m, x) => (x.duration > m.duration ? x : m));
    out.push({
      source: "speech",
      text:
        pauses.length === 1
          ? `На ${fmtTime(longest.start)} возникла пауза ${fmtSec(longest.duration)}. Продумай заранее переход к следующей части.`
          : `Длинных пауз — ${pauses.length}, самая долгая ${fmtSec(longest.duration)} на ${fmtTime(longest.start)}. Составь короткий план из 3–4 пунктов, чтобы легче переходить между частями.`,
    });
  }
  if (p.target_duration) {
    const actual = a.duration_ms / 1000;
    const diff = actual - p.target_duration;
    if (Math.abs(diff) > Math.max(15, p.target_duration * 0.2)) {
      out.push({
        source: "speech",
        text:
          diff > 0
            ? `Выступление заняло ${fmtTime(actual)} при цели ${fmtTime(p.target_duration)}. Подумай, какую часть можно сократить без потери смысла.`
            : `Выступление заняло ${fmtTime(actual)} при цели ${fmtTime(p.target_duration)}. Можно добавить пример или пояснение к главной мысли.`,
      });
    }
  }
  return out;
}

export function mergeRecommendations(speech: Recommendation[], structure: string[]): Recommendation[] {
  const s = structure.map((text) => ({ text, source: "structure" as const }));
  // 2–4 total: prefer up to 2 structure and fill with speech
  const res = [...s.slice(0, 2), ...speech.slice(0, 2)];
  for (const x of [...s.slice(2), ...speech.slice(2)]) if (res.length < 4) res.push(x);
  return res.slice(0, 4);
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function per100(fillers: number, words: number) {
  return words > 0 ? (fillers / words) * 100 : 0;
}
export function perMinute(count: number, ms: number) {
  return ms > 0 ? count / (ms / 60000) : 0;
}

export interface CompareRow {
  key: string;
  label: string;
  a: number;
  b: number;
  fmt: (v: number) => string;
  /** "lower" = lower is better, null = neutral (not inherently better or worse) */
  better: "lower" | "higher" | null;
}

export function compareRows(a: Attempt, b: Attempt): CompareRow[] {
  const fa = a.filler_words?.length ?? 0, fb = b.filler_words?.length ?? 0;
  const pa = a.pauses?.length ?? 0, pb = b.pauses?.length ?? 0;
  const one = (v: number) => v.toFixed(1).replace(".", ",");
  return [
    { key: "dur", label: "Продолжительность", a: a.duration_ms / 1000, b: b.duration_ms / 1000, fmt: fmtTime, better: null },
    { key: "words", label: "Слов", a: a.word_count ?? 0, b: b.word_count ?? 0, fmt: (v) => String(Math.round(v)), better: null },
    { key: "rate", label: "Темп, слов/мин", a: a.speech_rate ?? 0, b: b.speech_rate ?? 0, fmt: (v) => String(Math.round(v)), better: null },
    { key: "fill", label: "Слова-паразиты", a: fa, b: fb, fmt: (v) => String(Math.round(v)), better: "lower" },
    { key: "fill100", label: "Паразитов на 100 слов", a: per100(fa, a.word_count ?? 0), b: per100(fb, b.word_count ?? 0), fmt: one, better: "lower" },
    { key: "pause", label: "Длинные паузы", a: pa, b: pb, fmt: (v) => String(Math.round(v)), better: "lower" },
    { key: "pausemin", label: "Пауз в минуту", a: perMinute(pa, a.duration_ms), b: perMinute(pb, b.duration_ms), fmt: one, better: "lower" },
  ];
}

export function comparabilityWarning(a: Attempt, b: Attempt): string | null {
  const d = Math.min(a.duration_ms, b.duration_ms) / Math.max(a.duration_ms, b.duration_ms);
  const wa = a.word_count ?? 0, wb = b.word_count ?? 0;
  const w = Math.max(wa, wb) ? Math.min(wa, wb) / Math.max(wa, wb) : 1;
  if (d < 0.6 || w < 0.6)
    return "Одна попытка заметно короче другой или содержит меньше материала, поэтому прямое сравнение отдельных показателей ограничено. Ориентируйся на показатели «на 100 слов» и «в минуту».";
  return null;
}

export function structureDiff(a: Attempt, b: Attempt) {
  const ea = a.structure_analysis?.elements ?? [];
  const eb = b.structure_analysis?.elements ?? [];
  const names = Array.from(new Set([...ea.map((e) => e.name), ...eb.map((e) => e.name)]));
  return names.map((name) => ({
    name,
    a: ea.find((e) => e.name === name)?.found ?? null,
    b: eb.find((e) => e.name === name)?.found ?? null,
  }));
}

export function compareSummary(a: Attempt, b: Attempt): string {
  const good: string[] = [];
  const watch: string[] = [];
  const fa = per100(a.filler_words?.length ?? 0, a.word_count ?? 0);
  const fb = per100(b.filler_words?.length ?? 0, b.word_count ?? 0);
  if (fb < fa - 0.3) good.push("стало меньше слов-паразитов");
  else if (fb > fa + 0.3) watch.push("слов-паразитов стало больше");
  const pa = perMinute(a.pauses?.length ?? 0, a.duration_ms);
  const pb = perMinute(b.pauses?.length ?? 0, b.duration_ms);
  if (pb < pa - 0.1) good.push("стало меньше длинных пауз");
  else if (pb > pa + 0.1) watch.push("длинных пауз стало больше");
  const sd = structureDiff(a, b);
  const appeared = sd.filter((x) => x.a === false && x.b === true).map((x) => x.name.toLowerCase());
  const lost = sd.filter((x) => x.a === true && x.b === false).map((x) => x.name.toLowerCase());
  const missing = sd.filter((x) => x.b === false).map((x) => x.name.toLowerCase());

  const parts: string[] = [];
  if (good.length) parts.push(`Во второй попытке ${good.join(" и ")}.`);
  if (appeared.length) parts.push(`${appeared.length > 1 ? "Появились" : "Появилось"}: ${appeared.join(", ")}.`);
  if (watch.length) parts.push(`Обрати внимание: ${watch.join(" и ")}.`);
  if (lost.length) parts.push(`Пропало из структуры: ${lost.join(", ")}.`);
  if (!good.length && !appeared.length && !watch.length && !lost.length)
    parts.push("Показатели двух попыток почти не изменились.");
  if (missing.length) parts.push(`В следующий раз попробуй добавить: ${missing.join(", ")}.`);
  else if (!watch.length) parts.push("В следующий раз попробуй сделать переходы между частями ещё более плавными.");
  return parts.join(" ");
}
