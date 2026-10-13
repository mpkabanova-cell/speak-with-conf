import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Info, Minus, RotateCcw, Sparkles, X } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { StoredAudio } from "@/components/AudioPlayer";
import { PauseTimeline } from "@/components/Transcript";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { practiceQuery } from "@/lib/queries";
import { comparabilityWarning, compareRows, compareSummary, structureDiff, type CompareRow } from "@/lib/analysis";
import { fmtTime } from "@/lib/audio-analysis";
import { PRACTICE_TYPES, type Attempt } from "@/lib/types";
import { cn } from "@/lib/utils";

const search = z.object({ a: z.string().optional(), b: z.string().optional() });

export const Route = createFileRoute("/practice/$id/compare")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Сравнение выступлений — Скажи уверенно" },
      { name: "description", content: "Сравни две попытки и посмотри, как изменилась речь." },
      { property: "og:title", content: "Сравнение выступлений — Скажи уверенно" },
      { property: "og:description", content: "Сравни две попытки и посмотри на прогресс." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { id } = Route.useParams();
  const s = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const { data, isLoading } = useQuery(practiceQuery(id));

  if (isLoading || !data) return <AppShell><div className="mt-8 h-80 animate-pulse rounded-2xl bg-muted" /></AppShell>;
  const practice = data.practice;
  const ready = data.attempts.filter((a) => a.status === "ready");
  const num = (a: Attempt) => data.attempts.findIndex((x) => x.id === a.id) + 1;

  if (!practice || ready.length < 2)
    return (
      <AppShell>
        <div className="mx-auto max-w-md pt-16 text-center">
          <p className="text-xl font-bold">Недостаточно данных для сравнения</p>
          <p className="mt-2 text-muted-foreground">Нужно минимум две проанализированные попытки по одной теме.</p>
          {practice && <Button asChild className="mt-6"><Link to="/practice/$id/record" params={{ id }}><RotateCcw /> Записать попытку</Link></Button>}
        </div>
      </AppShell>
    );

  const A = ready.find((x) => x.id === s.a) ?? ready[ready.length - 2]!;
  const B = ready.find((x) => x.id === s.b && x.id !== A.id) ?? ready.filter((x) => x.id !== A.id).at(-1)!;
  const rows = compareRows(A, B);
  const warn = comparabilityWarning(A, B);
  const sd = structureDiff(A, B);
  const summary = compareSummary(A, B);

  const picker = (value: string, onChange: (v: string) => void, exclude: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto gap-2 rounded-lg border-0 bg-transparent px-0 text-lg font-extrabold shadow-none focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ready.map((a) => (
          <SelectItem key={a.id} value={a.id} disabled={a.id === exclude}>
            Попытка {num(a)} · {new Date(a.created_at).toLocaleDateString("ru-RU")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <AppShell>
      <Link to="/practice/$id" params={{ id }} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 inline size-4" /> К тренировке
      </Link>
      <p className="mt-4 text-sm font-bold text-brand-deep">{PRACTICE_TYPES[practice.type].label}</p>
      <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">Сравнение выступлений</h1>
      <p className="mt-1 text-muted-foreground">{practice.prompt}</p>

      {/* Summary */}
      <section className="mt-8 rounded-3xl bg-brand-soft p-6 md:p-8">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-brand-deep"><Sparkles className="size-4" /> Итог</p>
        <p className="mt-3 text-lg font-semibold leading-relaxed md:text-xl">{summary}</p>
      </section>
      {warn && (
        <p className="mt-4 flex gap-2 rounded-2xl bg-sun-soft p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-sun-deep" /> {warn}</p>
      )}

      {/* Side-by-side headers */}
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {([A, B] as Attempt[]).map((x, i) => (
          <div key={x.id} className={cn("rounded-2xl border p-5", i === 1 && "border-brand")}>
            <div className="flex items-center justify-between">
              {i === 0
                ? picker(A.id, (v) => nav({ search: { a: v, b: B.id } }), B.id)
                : picker(B.id, (v) => nav({ search: { a: A.id, b: v } }), A.id)}
              <span className="num text-sm text-muted-foreground">{fmtTime(x.duration_ms / 1000)}</span>
            </div>
            <StoredAudio audioKey={x.audio_reference} className="mt-3 h-10 w-full" />
            <div className="mt-4">
              <PauseTimeline duration={x.duration_ms / 1000} pauses={x.pauses ?? []} speech={x.speech_start != null && x.speech_end != null ? [x.speech_start, x.speech_end] : null} />
            </div>
            <Link to="/attempt/$id" params={{ id: x.id }} className="mt-2 inline-block text-sm font-semibold text-brand-deep hover:underline">Открыть анализ</Link>
          </div>
        ))}
      </section>

      {/* Metrics */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Показатели</h2>
        <div className="mt-4 divide-y rounded-2xl border">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Показатель</span><span>Попытка {num(A)}</span><span>Попытка {num(B)}</span><span>Изменение</span>
          </div>
          {rows.map((r) => <Row key={r.key} r={r} labels={[`Попытка ${num(A)}`, `Попытка ${num(B)}`]} />)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Темп и длительность не бывают «лучше» сами по себе — ориентируйся на смысл и формат выступления.</p>
      </section>

      {/* Structure */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Структура</h2>
        {sd.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Структура не анализировалась ни в одной из попыток. Запусти анализ структуры на странице попытки.</p>
        ) : (
          <div className="mt-4 divide-y rounded-2xl border">
            {sd.map((e) => {
              const improved = e.a === false && e.b === true;
              const lost = e.a === true && e.b === false;
              return (
                <div key={e.name} className={cn("grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]", improved && "bg-brand-soft")}>
                  <span className="font-semibold">{e.name}</span>
                  <Found v={e.a} />
                  <Found v={e.b} />
                  <span className={cn("hidden text-sm font-semibold md:block", improved ? "text-brand-deep" : lost ? "text-sun-deep" : "text-muted-foreground")}>
                    {improved ? "Появилось" : lost ? "Пропало" : e.a === null || e.b === null ? "Нет данных" : "Без изменений"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-12 flex justify-center">
        <Button size="lg" asChild><Link to="/practice/$id/record" params={{ id }}><RotateCcw /> Попробовать ещё раз</Link></Button>
      </div>
    </AppShell>
  );
}

function Found({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-sm text-muted-foreground">—</span>;
  return v ? (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-deep"><Check className="size-4" /> есть</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-sun-deep"><X className="size-4" /> нет</span>
  );
}

function Row({ r, labels }: { r: CompareRow; labels: [string, string] }) {
  const diff = r.b - r.a;
  const eps = r.key.includes("100") || r.key.includes("min") ? 0.05 : 0.5;
  const same = Math.abs(diff) < eps;
  const good = !same && r.better && (r.better === "lower" ? diff < 0 : diff > 0);
  const bad = !same && r.better && !good;
  const max = Math.max(r.a, r.b, 1e-6);
  const Icon = same ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const diffText = r.key === "dur" ? `${diff >= 0 ? "+" : "−"}${fmtTime(Math.abs(diff))}` : `${diff >= 0 ? "+" : "−"}${r.fmt(Math.abs(diff))}`;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:items-center">
      <span className="col-span-2 font-semibold md:col-span-1">{r.label}</span>
      {[r.a, r.b].map((v, i) => (
        <div key={i}>
          <span className="text-xs text-muted-foreground md:hidden">{labels[i]}</span>
          <p className="num text-2xl font-extrabold">{r.fmt(v)}</p>
          <div className="mt-1 h-1.5 w-full max-w-32 rounded-full bg-muted">
            <div className={cn("h-full rounded-full", i === 0 ? "bg-border" : good ? "bg-brand" : bad ? "bg-sun" : "bg-brand-light")} style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <span
        className={cn(
          "col-span-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold md:col-span-1",
          same ? "bg-muted text-muted-foreground" : good ? "bg-brand-soft text-brand-deep" : bad ? "bg-sun-soft text-sun-deep" : "bg-muted text-foreground",
        )}
      >
        <Icon className="size-3.5" /> {same ? "без изменений" : diffText}
      </span>
    </div>
  );
}
