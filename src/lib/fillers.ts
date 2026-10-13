import type { FillerHit } from "./types";

const L = "а-яёa-z";

interface Rule {
  word: string;
  re: RegExp;
  accept?: (text: string, start: number, end: number) => boolean;
}

const before = (t: string, s: number) => t.slice(Math.max(0, s - 25), s).toLowerCase();
const after = (t: string, e: number) => t.slice(e, e + 25).toLowerCase();
const atClauseStart = (t: string, s: number) => /(^|[.!?,;:—–])\s*$/.test(t.slice(0, s));
const followedByComma = (t: string, e: number) => /^\s*[,—–]/.test(t.slice(e));

const rules: Rule[] = [
  { word: "э-э", re: new RegExp(`(?<![${L}])э+(?:-?э+)*м*(?![${L}])`, "gi") },
  { word: "эм", re: new RegExp(`(?<![${L}])(?:э+м+|м{2,}|хм+)(?![${L}])`, "gi") },
  {
    word: "ну",
    re: new RegExp(`(?<![${L}])ну(?![${L}])`, "gi"),
    // «да ну», «ну и ну» — междометия-реплики, не заполнители в монологе — всё равно редкость; исключаем «ну и что» как оборот
    accept: (t, _s, e) => !/^\s+и\s+что/.test(after(t, e)),
  },
  {
    word: "как бы",
    re: new RegExp(`(?<![${L}])как\\s+бы(?![${L}])`, "gi"),
    // «как бы не опоздать», «как бы то ни было», «как бы ни...» — нормальная речь
    accept: (t, _s, e) => !/^\s*(не|ни|то\s+ни)(?![а-яё])/.test(after(t, e)),
  },
  {
    word: "типа",
    re: new RegExp(`(?<![${L}])типа(?![${L}])`, "gi"),
    // «этого типа», «нового типа», «типа данных» (после прилагательного/местоимения) — существительное
    accept: (t, s) => !/(ого|его|ой|ей|ого типа|ного)\s*$/.test(before(t, s)) ,
  },
  {
    word: "короче",
    re: new RegExp(`(?<![${L}])короче(?![${L}])`, "gi"),
    // заполнитель — в начале фразы или с запятой; «стало короче», «короче, чем» — сравнение
    accept: (t, s, e) =>
      (atClauseStart(t, s) || followedByComma(t, e)) && !/^\s*,?\s*чем/.test(after(t, e)),
  },
  {
    word: "в общем",
    re: new RegExp(`(?<![${L}])в\\s+общем(?![${L}])`, "gi"),
    accept: (t, s, e) =>
      !/^\s+(и\s+целом|виде|смысле|случае|плане|деле|доступе|количестве)/.test(after(t, e)) &&
      (atClauseStart(t, s) || followedByComma(t, e)),
  },
  { word: "это самое", re: new RegExp(`(?<![${L}])это\\s+самое(?![${L}])`, "gi"),
    accept: (t, _s, e) => !/^\s+(главное|важное|интересное|большое|первое)/.test(after(t, e)) },
  {
    word: "значит",
    re: new RegExp(`(?<![${L}])значит(?![${L}])`, "gi"),
    // заполнитель: «…, значит, …» не в значении «следовательно / означает»
    accept: (t, s, e) => {
      const b = before(t, s);
      const a = after(t, e);
      if (/(это|что|то|не|и)\s*$/.test(b)) return false; // «это значит», «что значит»
      if (/^\s*,?\s*(что|ли)(?![а-яё])/.test(a)) return false; // «значит, что», «значит ли»
      return /[,]\s*$/.test(b) && /^\s*,/.test(a); // выделено запятыми с двух сторон
    },
  },
];

export const FILLER_DICTIONARY = rules.map((r) => r.word);

export function findFillers(text: string): FillerHit[] {
  const hits: FillerHit[] = [];
  for (const r of rules) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (!r.accept || r.accept(text, s, e)) hits.push({ word: r.word, start: s, end: e });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  // remove overlaps
  const out: FillerHit[] = [];
  for (const h of hits) if (!out.length || h.start >= out[out.length - 1]!.end) out.push(h);
  return out;
}

export function fillerFrequency(hits: FillerHit[]): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const h of hits) m.set(h.word, (m.get(h.word) ?? 0) + 1);
  return [...m.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
}

export function countWords(text: string): number {
  return (text.match(/[0-9a-zа-яё]+(?:[-'][0-9a-zа-яё]+)*/gi) ?? []).length;
}
