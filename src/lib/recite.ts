/** Word-by-word comparison of a recited transcript against the source text. Case and punctuation are ignored (speech has none). */

export type ReciteStatus = "ok" | "missed" | "wrong" | "plain";

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
  missed: number;
  wrong: number;
  extra: number;
}

export const normWord = (w: string) =>
  w.normalize("NFC").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");

export function compareRecitation(source: string, spoken: string): ReciteResult {
  const tokens: ReciteToken[] = [];
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) tokens.push({ text: m[1]!, sep: m[2]!, status: "plain", extraBefore: [] });
  const expIdx = tokens.map((t, i) => (normWord(t.text) ? i : -1)).filter((i) => i >= 0);
  const a = expIdx.map((i) => normWord(tokens[i]!.text));
  const saidRaw = spoken.split(/\s+/).filter((w) => normWord(w));
  const b = saidRaw.map(normWord);
  const n = a.length, mm = b.length;

  // LCS table on suffixes
  const W = mm + 1;
  const dp = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--)
    for (let j = mm - 1; j >= 0; j--)
      dp[i * W + j] = a[i]! === b[j]! ? dp[(i + 1) * W + j + 1]! + 1 : Math.max(dp[(i + 1) * W + j]!, dp[i * W + j + 1]!);

  let missed = 0, wrong = 0, extra = 0, matched = 0;
  let dels: number[] = [], ins: number[] = [];
  const extraEnd: string[] = [];
  const flush = (nextExp: number | null) => {
    const k = Math.min(dels.length, ins.length);
    for (let x = 0; x < k; x++) {
      const t = tokens[expIdx[dels[x]!]!]!;
      t.status = "wrong";
      t.said = saidRaw[ins[x]!]!;
      wrong++;
    }
    for (const d of dels.slice(k)) { tokens[expIdx[d]!]!.status = "missed"; missed++; }
    const rest = ins.slice(k).map((j) => saidRaw[j]!);
    extra += rest.length;
    if (nextExp != null) tokens[expIdx[nextExp]!]!.extraBefore.push(...rest);
    else extraEnd.push(...rest);
    dels = []; ins = [];
  };

  let i = 0, j = 0;
  while (i < n || j < mm) {
    if (i < n && j < mm && a[i]! === b[j]!) {
      flush(i);
      tokens[expIdx[i]!]!.status = "ok";
      matched++; i++; j++;
    } else if (j >= mm || (i < n && dp[(i + 1) * W + j]! >= dp[i * W + j + 1]!)) {
      dels.push(i++);
    } else {
      ins.push(j++);
    }
  }
  flush(null);
  return { tokens, extraEnd, total: n, matched, missed, wrong, extra };
}
