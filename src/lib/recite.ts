/** Word-by-word comparison of a recited transcript against the source text.
 * Case and punctuation are ignored (speech has none). Deterministic, no AI.
 * Near-identical spellings (typical speech-recognition slips like «пожелтили» for «пожелтели»)
 * count as matched; borderline ones are "fuzzy"; split/joined words are merged. */

export type ReciteStatus = "ok" | "fuzzy" | "missed" | "wrong" | "plain";

export interface ReciteToken {
  text: string;
  sep: string;
  status: ReciteStatus;
  said?: string;
  extraBefore: string[];
}

export interface ReciteResult {
  tokens: ReciteToken[];
  extraEnd: string[];
  total: number;
  matched: number;
  fuzzy: number;
  missed: number;
  wrong: number;
  extra: number;
}

export const normWord = (w: string) =>
  w.normalize("NFC").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");

function lev(a: string, b: string) {
  if (a === b) return 0;
  const m = b.length;
  let prev = Array.from({ length: m + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let k = 1; k <= m; k++)
      cur[k] = Math.min(prev[k]! + 1, cur[k - 1]! + 1, prev[k - 1]! + (a[i - 1] === b[k - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[m]!;
}

/** "ok" | "fuzzy" | null (different word). Short words must match exactly. */
export function wordMatch(a: string, b: string): "ok" | "fuzzy" | null {
  if (a === b) return "ok";
  const L = Math.max(a.length, b.length);
  if (L < 4) return null;
  const d = lev(a, b);
  if (L >= 5 && d <= Math.max(1, Math.round(L * 0.25))) return "ok";
  if (d <= Math.round(L * 0.4)) return "fuzzy";
  return null;
}

const SCORE = { ok: 2, fuzzy: 1.5 } as const;

export function compareRecitation(source: string, spoken: string, accepted: number[] = []): ReciteResult {
  const tokens: ReciteToken[] = [];
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) tokens.push({ text: m[1]!, sep: m[2]!, status: "plain", extraBefore: [] });
  const expIdx = tokens.map((t, i) => (normWord(t.text) ? i : -1)).filter((i) => i >= 0);
  const a = expIdx.map((i) => normWord(tokens[i]!.text));
  const saidRaw = spoken.split(/\s+/).filter((w) => normWord(w));
  const b = saidRaw.map(normWord);
  const n = a.length, mm = b.length;
  const W = mm + 1;

  // Max-score alignment on suffixes. Moves: 1 = pair, 2 = skip source, 3 = skip spoken, 4 = source↔2 spoken, 5 = 2 source↔spoken
  const dp = new Float32Array((n + 1) * W);
  const mv = new Uint8Array((n + 1) * W);
  const at = (i: number, j: number) => dp[i * W + j]!;
  for (let i = n; i >= 0; i--)
    for (let j = mm; j >= 0; j--) {
      if (i === n && j === mm) continue;
      let best = -1, move = 0;
      if (i < n) { best = at(i + 1, j); move = 2; }
      if (j < mm && at(i, j + 1) > best) { best = at(i, j + 1); move = 3; }
      if (i < n && j < mm) {
        const r = wordMatch(a[i]!, b[j]!);
        if (r && at(i + 1, j + 1) + SCORE[r] > best) { best = at(i + 1, j + 1) + SCORE[r]; move = 1; }
      }
      if (i < n && j + 1 < mm && a[i]!.length >= 4) {
        const r = wordMatch(a[i]!, b[j]! + b[j + 1]!);
        if (r && at(i + 1, j + 2) + SCORE[r] + 0.1 > best) { best = at(i + 1, j + 2) + SCORE[r] + 0.1; move = 4; }
      }
      if (i + 1 < n && j < mm && b[j]!.length >= 4) {
        const r = wordMatch(a[i]! + a[i + 1]!, b[j]!);
        if (r && at(i + 2, j + 1) + 2 * SCORE[r] - 0.1 > best) { best = at(i + 2, j + 1) + 2 * SCORE[r] - 0.1; move = 5; }
      }
      dp[i * W + j] = best;
      mv[i * W + j] = move;
    }

  let missed = 0, wrong = 0, extra = 0, matched = 0, fuzzy = 0;
  let dels: number[] = [], ins: number[] = [];
  const extraEnd: string[] = [];
  const flush = (nextExp: number | null) => {
    const k = Math.min(dels.length, ins.length);
    for (let x = 0; x < k; x++) {
      const t = tokens[expIdx[dels[x]!]!]!;
      t.status = "wrong";
      t.said = saidRaw[ins[x]!]!;
    }
    for (const d of dels.slice(k)) tokens[expIdx[d]!]!.status = "missed";
    const rest = ins.slice(k).map((j) => saidRaw[j]!);
    extra += rest.length;
    if (nextExp != null) tokens[expIdx[nextExp]!]!.extraBefore.push(...rest);
    else extraEnd.push(...rest);
    dels = []; ins = [];
  };
  const mark = (i: number, r: "ok" | "fuzzy", said: string) => {
    const t = tokens[expIdx[i]!]!;
    t.status = r;
    if (r === "fuzzy" || normWord(said) !== a[i]) t.said = said;
  };

  let i = 0, j = 0;
  while (i < n || j < mm) {
    const move = mv[i * W + j]!;
    if (move === 1) {
      flush(i); mark(i, wordMatch(a[i]!, b[j]!)!, saidRaw[j]!); i++; j++;
    } else if (move === 4) {
      flush(i); mark(i, wordMatch(a[i]!, b[j]! + b[j + 1]!)!, `${saidRaw[j]} ${saidRaw[j + 1]}`); i++; j += 2;
    } else if (move === 5) {
      flush(i);
      const r = wordMatch(a[i]! + a[i + 1]!, b[j]!)!;
      mark(i, r, saidRaw[j]!); mark(i + 1, r, saidRaw[j]!); i += 2; j++;
    } else if (move === 2) dels.push(i++);
    else ins.push(j++);
  }
  flush(null);

  const acc = new Set(accepted);
  expIdx.forEach((ti, k) => {
    const t = tokens[ti]!;
    if (acc.has(k) && t.status !== "ok") { t.status = "ok"; delete t.said; }
    if (t.status === "ok") matched++;
    else if (t.status === "fuzzy") fuzzy++;
    else if (t.status === "missed") missed++;
    else if (t.status === "wrong") wrong++;
  });
  return { tokens, extraEnd, total: n, matched, fuzzy, missed, wrong, extra };
}

/** Index of a source token among word tokens (for "accept" overrides). */
export function wordIndexOf(tokens: ReciteToken[], tokenIdx: number) {
  let k = 0;
  for (let x = 0; x < tokenIdx; x++) if (normWord(tokens[x]!.text)) k++;
  return k;
}
