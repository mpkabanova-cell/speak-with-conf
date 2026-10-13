import { Fragment, type ReactNode } from "react";
import { Pause as PauseIcon } from "lucide-react";
import type { FillerHit, Pause, TranscriptChunk } from "@/lib/types";
import { fmtSec, fmtTime } from "@/lib/audio-analysis";

/** Char offsets in `text` where each pause best fits between Whisper chunks. */
function pauseOffsets(text: string, chunks: TranscriptChunk[] | null, pauses: Pause[]) {
  if (!chunks?.length) return [];
  const joined = chunks.map((c) => c.text).join("");
  const lead = joined.length - joined.trimStart().length;
  if (joined.trim() !== text) return [];
  const bounds: { at: number; time: number }[] = [];
  let pos = 0;
  chunks.forEach((c, i) => {
    if (i > 0) bounds.push({ at: Math.max(0, pos - lead), time: c.start });
    pos += c.text.length;
  });
  const out: { at: number; pause: Pause }[] = [];
  for (const p of pauses) {
    let best: { at: number; d: number } | null = null;
    for (const b of bounds) {
      const d = Math.abs(b.time - p.end);
      if (d <= 2 && (!best || d < best.d)) best = { at: b.at, d };
    }
    if (best) out.push({ at: best.at, pause: p });
  }
  return out;
}

export function TranscriptView({
  text,
  fillers,
  pauses,
  chunks,
}: {
  text: string;
  fillers: FillerHit[];
  pauses: Pause[];
  chunks: TranscriptChunk[] | null;
}) {
  const marks = pauseOffsets(text, chunks, pauses);
  const cuts = new Set<number>([0, text.length]);
  fillers.forEach((f) => { cuts.add(f.start); cuts.add(f.end); });
  marks.forEach((m) => cuts.add(m.at));
  const pts = [...cuts].sort((a, b) => a - b);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < pts.length; i++) {
    const at = pts[i];
    marks.filter((m) => m.at === at).forEach((m, k) =>
      nodes.push(
        <span key={`p${at}-${k}`} className="mx-1 inline-flex translate-y-[-1px] items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 align-middle text-xs font-semibold text-muted-foreground" title={`Пауза с ${fmtTime(m.pause.start)}`}>
          <PauseIcon className="size-3" /> {fmtSec(m.pause.duration)}
        </span>,
      ),
    );
    if (i === pts.length - 1) break;
    const seg = text.slice(at, pts[i + 1]);
    const f = fillers.find((x) => x.start === at);
    nodes.push(f ? <mark key={`f${at}`} className="filler-mark text-foreground">{seg}</mark> : <Fragment key={`t${at}`}>{seg}</Fragment>);
  }
  return <p className="max-w-prose whitespace-pre-wrap text-[17px] leading-8">{nodes}</p>;
}

export function PauseTimeline({ duration, pauses, speech }: { duration: number; pauses: Pause[]; speech?: [number, number] | null }) {
  if (duration <= 0) return null;
  const pct = (t: number) => `${(t / duration) * 100}%`;
  return (
    <div>
      <div className="relative h-8 overflow-hidden rounded-lg bg-muted">
        {speech && (
          <div className="absolute inset-y-0 bg-brand-soft" style={{ left: pct(speech[0]), width: pct(speech[1] - speech[0]) }} />
        )}
        {pauses.map((p, i) => (
          <div
            key={i}
            className="absolute inset-y-1 rounded bg-sun"
            style={{ left: pct(p.start), width: `max(4px, ${pct(p.duration)})` }}
            title={`${fmtTime(p.start)}–${fmtTime(p.end)}, ${fmtSec(p.duration)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground num">
        <span>0:00</span>
        <span>{fmtTime(duration)}</span>
      </div>
    </div>
  );
}
