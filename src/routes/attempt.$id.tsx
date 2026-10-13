import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, Check, CircleDashed, GitCompareArrows, Lightbulb, Loader2, Pencil, RotateCcw, ShieldCheck, X,
} from "lucide-react";
import { AppShell, StorageNote } from "@/components/AppShell";
import { StoredAudio } from "@/components/AudioPlayer";
import { PauseTimeline, TranscriptView } from "@/components/Transcript";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { attemptQuery } from "@/lib/queries";
import { getAudio, saveAttempt } from "@/lib/db";
import { decodeTo16k, detectSpeech, findPauses, fmtSec, fmtTime } from "@/lib/audio-analysis";
import { transcribe, type TranscribeProgress } from "@/lib/transcribe";
import { hashText, mergeRecommendations, speechRecommendations, textMetrics } from "@/lib/analysis";
import { fillerFrequency } from "@/lib/fillers";
import { analyzeStructure } from "@/lib/structure.functions";
import { PRACTICE_TYPES, type Attempt, type Practice } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attempt/$id")({
  head: () => ({
    meta: [
      { title: "Анализ выступления — Скажи уверенно" },
      { name: "description", content: "Показатели речи, рекомендации, структура и расшифровка выступления." },
      { property: "og:title", content: "Анализ выступления — Скажи уверенно" },
      { property: "og:description", content: "Показатели речи, рекомендации и расшифровка." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttemptPage,
});

type Stage = { key: "decode" | "loading" | "transcribing" | "metrics"; percent?: number | null } | null;

function AttemptPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery(attemptQuery(id));
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>(null);
  const running = useRef(false);

  const attempt = data?.attempt ?? null;
  const practice = data?.practice ?? null;

  async function update(a: Attempt) {
    await saveAttempt(a);
    qc.setQueryData(attemptQuery(id).queryKey, (d) => (d ? { ...d, attempt: a } : d));
    void qc.invalidateQueries({ queryKey: ["practice", a.practice_id] });
    void qc.invalidateQueries({ queryKey: ["practices"] });
  }

  async function runPipeline(a: Attempt, p: Practice) {
    if (running.current) return;
    running.current = true;
    try {
      setStage({ key: "decode" });
      const blob = await getAudio(a.audio_reference);
      if (!blob) throw new Error("Аудиозапись не найдена в браузере.");
      let decoded;
      try {
        decoded = await decodeTo16k(blob);
      } catch {
        throw new Error("Не удалось прочитать аудиозапись. Попробуй записать ещё раз.");
      }
      const duration_ms = Math.round(decoded.duration * 1000);
      const { segments } = detectSpeech(decoded.samples);
      const pauses = findPauses(segments);
      const speech_start = segments[0]?.[0] ?? null;
      const speech_end = segments[segments.length - 1]?.[1] ?? null;
      let cur: Attempt = { ...a, duration_ms, pauses, speech_start, speech_end, status: "transcribing", error: null };
      await update(cur);
      if (!segments.length) throw new Error("В записи не удалось обнаружить речь. Проверь микрофон и запиши ещё раз.");

      const tr = await transcribe(decoded.samples, (pr: TranscribeProgress) =>
        setStage(pr.stage === "loading" ? { key: "loading", percent: pr.percent } : { key: "transcribing" }),
      );
      setStage({ key: "metrics" });
      const transcript = tr.chunks.length ? tr.chunks.map((c) => c.text).join("").trim() : tr.text;
      if (!transcript) throw new Error("Распознавание не вернуло текст. Попробуй говорить ближе к микрофону.");
      cur = { ...cur, transcript, chunks: tr.chunks, transcript_edited: false, ...textMetrics(transcript, duration_ms), status: "ready" };
      cur.recommendations = mergeRecommendations(speechRecommendations(cur, p), []);
      await update(cur);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cur = (await qc.fetchQuery(attemptQuery(id))).attempt ?? a;
      await update({ ...cur, status: "error", error: /memory|allocation|out of/i.test(msg) ? "Недостаточно памяти устройства для распознавания. Закрой другие вкладки и попробуй снова." : msg });
    } finally {
      setStage(null);
      running.current = false;
    }
  }

  useEffect(() => {
    if (attempt && practice && (attempt.status === "recorded" || attempt.status === "transcribing") && !running.current) {
      void runPipeline(attempt, practice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, attempt?.status, practice?.id]);

  if (isLoading || !data) return <AppShell><div className="mt-8 h-60 animate-pulse rounded-2xl bg-muted" /></AppShell>;
  if (!attempt || !practice)
    return (
      <AppShell>
        <p className="pt-10 font-bold">Попытка не найдена</p>
        <Button asChild className="mt-4"><Link to="/history">К тренировкам</Link></Button>
      </AppShell>
    );

  return (
    <AppShell>
      <Link to="/practice/$id" params={{ id: practice.id }} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 inline size-4" /> К тренировке
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-brand-deep">{PRACTICE_TYPES[practice.type].label} · Попытка {data.index}</p>
          <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{practice.prompt}</h1>
        </div>
      </div>
      <StoredAudio audioKey={attempt.audio_reference} className="mt-6 w-full" />

      {attempt.status !== "ready" ? (
        <ProcessingState attempt={attempt} stage={stage} onRetry={() => void update({ ...attempt, status: "recorded", error: null })} practiceId={practice.id} />
      ) : (
        <Results attempt={attempt} practice={practice} update={update} index={data.index} />
      )}
    </AppShell>
  );
}

function ProcessingState({ attempt, stage, onRetry, practiceId }: { attempt: Attempt; stage: Stage; onRetry: () => void; practiceId: string }) {
  if (attempt.status === "error")
    return (
      <div className="mt-8 rounded-2xl bg-sun-soft p-6">
        <p className="flex items-center gap-2 font-bold"><AlertCircle className="size-5 text-sun-deep" /> Ошибка распознавания</p>
        <p className="mt-2 text-sm text-muted-foreground">{attempt.error}</p>
        <p className="mt-1 text-sm text-muted-foreground">Аудиозапись сохранена — можно попробовать снова.</p>
        <div className="mt-4 flex gap-3">
          <Button onClick={onRetry}><RotateCcw /> Повторить анализ</Button>
          <Button variant="outline" asChild><Link to="/practice/$id/record" params={{ id: practiceId }}>Записать заново</Link></Button>
        </div>
      </div>
    );
  const steps: { key: NonNullable<Stage>["key"]; label: string }[] = [
    { key: "decode", label: "Измеряю длительность и паузы" },
    { key: "loading", label: "Загружаю модель распознавания" },
    { key: "transcribing", label: "Расшифровываю речь" },
    { key: "metrics", label: "Рассчитываю показатели" },
  ];
  const idx = stage ? steps.findIndex((s) => s.key === stage.key) : 0;
  return (
    <div className="mt-8 rounded-2xl border p-6">
      <ul className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className={cn("flex items-center gap-3 text-sm", i > idx && "text-muted-foreground")}>
            {i < idx ? <Check className="size-4 text-brand-deep" /> : i === idx ? <Loader2 className="size-4 animate-spin text-brand" /> : <CircleDashed className="size-4" />}
            <span className={cn(i === idx && "font-semibold")}>{s.label}</span>
            {i === idx && stage?.key === "loading" && stage.percent != null && <span className="num text-muted-foreground">{stage.percent}%</span>}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-muted-foreground">
        Распознавание работает прямо в браузере — аудио никуда не отправляется. Первая загрузка модели может занять пару минут, потом она сохранится.
      </p>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="bg-background px-5 py-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="num mt-1 text-3xl font-extrabold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const CONSENT_KEY = "su-ai-consent";

function Results({ attempt, practice, update, index }: { attempt: Attempt; practice: Practice; update: (a: Attempt) => Promise<void>; index: number }) {
  const analyze = useServerFn(analyzeStructure);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(attempt.transcript ?? "");
  const autoRan = useRef(false);

  const transcript = attempt.transcript ?? "";
  const fillers = attempt.filler_words ?? [];
  const pauses = attempt.pauses ?? [];
  const freq = fillerFrequency(fillers);
  const dur = attempt.duration_ms / 1000;
  const sa = attempt.structure_analysis;
  const stale = !!sa && sa.transcript_hash !== hashText(transcript);

  async function runAI() {
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await analyze({ data: { type: practice.type, prompt: practice.prompt, transcript: transcript.slice(0, 20000) } });
      if (!r.ok) {
        setAiError(r.error);
        return;
      }
      const structure_analysis = { ...r.result, transcript_hash: hashText(transcript) };
      await update({
        ...attempt,
        structure_analysis,
        recommendations: mergeRecommendations(speechRecommendations(attempt, practice), r.result.recommendations),
      });
    } catch {
      setAiError("ИИ-сервис временно недоступен. Показатели и расшифровка сохранены.");
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(() => {
    if (!sa && !autoRan.current && typeof window !== "undefined" && localStorage.getItem(CONSENT_KEY) === "1") {
      autoRan.current = true;
      void runAI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveEdit() {
    const t = draft.trim();
    if (!t) {
      toast.error("Текст не может быть пустым");
      return;
    }
    const next: Attempt = { ...attempt, transcript: t, transcript_edited: true, ...textMetrics(t, attempt.duration_ms) };
    next.recommendations = mergeRecommendations(speechRecommendations(next, practice), next.structure_analysis?.recommendations ?? []);
    await update(next);
    setEditing(false);
    toast.success("Расшифровка обновлена, показатели пересчитаны");
  }

  const targetDiff = practice.target_duration ? dur - practice.target_duration : null;

  return (
    <div className="mt-8 space-y-12">
      {index > 1 && (
        <Link to="/practice/$id/compare" params={{ id: practice.id }} className="flex items-center justify-between gap-4 rounded-2xl bg-brand-soft px-5 py-4 font-bold text-brand-deep hover:bg-brand-light/40">
          <span className="flex items-center gap-2"><GitCompareArrows className="size-5" /> Сравнить с предыдущей попыткой</span>
          <span aria-hidden>→</span>
        </Link>
      )}
      {/* Metrics */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <Metric
          label="Продолжительность"
          value={fmtTime(dur)}
          sub={targetDiff != null ? `${targetDiff >= 0 ? "+" : "−"}${fmtTime(Math.abs(targetDiff))} от цели` : undefined}
        />
        <Metric label="Слов" value={String(attempt.word_count ?? 0)} />
        <Metric label="Средний темп" value={String(attempt.speech_rate ?? 0)} sub="слов в минуту" />
        <Metric label="Слова-паразиты" value={String(fillers.length)} sub={freq.slice(0, 2).map((f) => `«${f.word}» ×${f.count}`).join(", ") || "не обнаружены"} />
        <Metric label="Длинные паузы" value={String(pauses.length)} sub="от 2 секунд" />
      </section>

      {/* Recommendations */}
      <section>
        <h2 className="flex items-center gap-2 text-xl font-bold"><Lightbulb className="size-5 text-sun-deep" /> Что улучшить</h2>
        {attempt.recommendations?.length ? (
          <ol className="mt-4 space-y-3">
            {attempt.recommendations.map((r, i) => (
              <li key={i} className="flex gap-4 rounded-2xl bg-sun-soft/60 p-4">
                <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-sun text-sm font-extrabold text-record-foreground">{i + 1}</span>
                <p className="leading-relaxed">{r.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-muted-foreground">По показателям речи серьёзных замечаний нет. Рекомендации по структуре появятся после её анализа.</p>
        )}
      </section>

      {/* Structure */}
      <section>
        <h2 className="text-xl font-bold">Структура выступления</h2>
        {!sa || stale ? (
          <div className="mt-4 rounded-2xl border p-5">
            {stale && <p className="mb-3 text-sm font-semibold text-sun-deep">Расшифровка изменилась — структуру можно проанализировать заново.</p>}
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-deep" />
              Для анализа структуры текст расшифровки (без аудио) будет отправлен во внешний ИИ-сервис. Запись и показатели остаются в браузере.
            </p>
            {aiError && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-destructive"><AlertCircle className="size-4" /> {aiError}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Button
                onClick={() => {
                  if (remember) localStorage.setItem(CONSENT_KEY, "1");
                  void runAI();
                }}
                disabled={aiBusy}
              >
                {aiBusy ? <><Loader2 className="animate-spin" /> Генерирую рекомендации…</> : aiError ? "Попробовать снова" : "Проанализировать структуру"}
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} /> Больше не спрашивать
              </label>
            </div>
          </div>
        ) : null}
        {sa && (
          <div className={cn("mt-4", stale && "opacity-60")}>
            <ul className="divide-y rounded-2xl border">
              {sa.elements.map((e, i) => (
                <li key={i} className="flex gap-4 p-4">
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", e.found ? "bg-brand text-primary-foreground" : "bg-sun-soft text-sun-deep")}>
                    {e.found ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {e.name} <span className={cn("ml-1 text-sm font-semibold", e.found ? "text-brand-deep" : "text-sun-deep")}>{e.found ? "есть" : "не обнаружено"}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{e.comment}</p>
                    {e.evidence && <p className="mt-1.5 border-l-2 border-brand-light pl-3 text-sm italic">«{e.evidence}»</p>}
                  </div>
                </li>
              ))}
            </ul>
            {sa.sequence_issues.length > 0 && (
              <div className="mt-4 rounded-2xl bg-surface p-4 text-sm">
                <p className="font-bold">Логика изложения</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {sa.sequence_issues.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Pauses */}
      <section>
        <h2 className="text-xl font-bold">Паузы на записи</h2>
        <div className="mt-4"><PauseTimeline duration={dur} pauses={pauses} speech={attempt.speech_start != null && attempt.speech_end != null ? [attempt.speech_start, attempt.speech_end] : null} /></div>
        {pauses.length ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {pauses.map((p, i) => (
              <li key={i} className="num rounded-lg bg-sun-soft px-2.5 py-1">{fmtTime(p.start)}–{fmtTime(p.end)} · {fmtSec(p.duration)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Пауз длиннее 2 секунд не обнаружено.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Паузы определяются по громкости звука; фоновый шум может влиять на точность.</p>
      </section>

      {/* Transcript */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Расшифровка</h2>
          {!editing && <Button variant="ghost" size="sm" onClick={() => { setDraft(transcript); setEditing(true); }}><Pencil /> Исправить</Button>}
        </div>
        <div className="mt-4 rounded-2xl bg-surface p-5 md:p-7">
          {editing ? (
            <>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-60 bg-background text-base leading-7" />
              <p className="mt-2 text-xs text-muted-foreground">Количество слов, темп и слова-паразиты пересчитаются. Длительность и паузы взяты из аудио и не изменятся.</p>
              <div className="mt-3 flex gap-2">
                <Button onClick={saveEdit}>Сохранить</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Отмена</Button>
              </div>
            </>
          ) : (
            <TranscriptView text={transcript} fillers={fillers} pauses={attempt.transcript_edited ? [] : pauses} chunks={attempt.chunks} />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <mark className="filler-mark">Подсвечены</mark> обнаруженные слова-паразиты. Распознавание может пропускать «э-э» и запинки, поэтому их реальное число может быть больше.
        </p>
      </section>

      {/* Next */}
      <section className="flex flex-col items-center gap-4 rounded-3xl bg-brand-soft px-6 py-10 text-center">
        <p className="text-lg font-bold">Готов к следующей попытке?</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild><Link to="/practice/$id/record" params={{ id: practice.id }}><RotateCcw /> Попробовать ещё раз</Link></Button>
          <Button size="lg" variant="outline" asChild><Link to="/practice/$id" params={{ id: practice.id }}>Все попытки</Link></Button>
        </div>
        <StorageNote />
      </section>
    </div>
  );
}
