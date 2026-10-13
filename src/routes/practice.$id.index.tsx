import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GitCompareArrows, Mic, Trash2, ChevronRight } from "lucide-react";
import { AppShell, StorageNote } from "@/components/AppShell";
import { StoredAudio } from "@/components/AudioPlayer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { practiceQuery } from "@/lib/queries";
import { deleteAttempt, deletePractice } from "@/lib/db";
import { PRACTICE_TYPES } from "@/lib/types";
import { fmtTime } from "@/lib/audio-analysis";

export const Route = createFileRoute("/practice/$id/")({
  head: () => ({
    meta: [
      { title: "Тренировка — Скажи уверенно" },
      { name: "description", content: "Попытки по теме, прослушивание и сравнение." },
      { property: "og:title", content: "Тренировка — Скажи уверенно" },
      { property: "og:description", content: "Попытки по теме, прослушивание и сравнение." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PracticePage,
});

function PracticePage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery(practiceQuery(id));
  const qc = useQueryClient();
  const nav = useNavigate();
  const [sel, setSel] = useState<string[]>([]);

  if (isLoading || !data) return <AppShell><div className="mt-8 h-60 animate-pulse rounded-2xl bg-muted" /></AppShell>;
  if (!data.practice)
    return (
      <AppShell>
        <p className="pt-10 font-bold">Тренировка не найдена</p>
        <Button asChild className="mt-4"><Link to="/history">К списку</Link></Button>
      </AppShell>
    );
  const { practice, attempts } = data;
  const ready = attempts.filter((a) => a.status === "ready");
  const toggle = (aid: string) =>
    setSel((s) => (s.includes(aid) ? s.filter((x) => x !== aid) : [...s.slice(-1), aid]));

  return (
    <AppShell>
      <div className="pt-6">
        <p className="text-sm font-bold text-brand-deep">{PRACTICE_TYPES[practice.type].label}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{practice.prompt}</h1>
        {practice.target_duration && (
          <p className="mt-2 text-muted-foreground">Цель: {fmtTime(practice.target_duration)}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to="/practice/$id/record" params={{ id }}><Mic /> {attempts.length ? "Новая попытка" : "Записать"}</Link>
          </Button>
          {ready.length >= 2 && (
            <Button
              size="lg"
              variant="outline"
              disabled={sel.length !== 2}
              onClick={() => {
                const [a, b] = [...sel].sort(
                  (x, y) => attempts.findIndex((t) => t.id === x) - attempts.findIndex((t) => t.id === y),
                );
                nav({ to: "/practice/$id/compare", params: { id }, search: { a, b } });
              }}
            >
              <GitCompareArrows /> Сравнить {sel.length === 2 ? "выбранные" : "(выбери две)"}
            </Button>
          )}
        </div>
      </div>

      <h2 className="mt-12 text-lg font-bold">Попытки</h2>
      {attempts.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface p-6 text-muted-foreground">Пока нет записей по этой теме.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {attempts.map((a, i) => (
            <li key={a.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-3">
                {a.status === "ready" && ready.length >= 2 && (
                  <Checkbox checked={sel.includes(a.id)} onCheckedChange={() => toggle(a.id)} aria-label="Выбрать для сравнения" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Попытка {i + 1}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })} · {fmtTime(a.duration_ms / 1000)}
                    {a.status === "ready" && ` · ${a.filler_words?.length ?? 0} паразит. · ${a.pauses?.length ?? 0} пауз`}
                    {a.status !== "ready" && " · анализ не завершён"}
                  </p>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/attempt/$id" params={{ id: a.id }}>
                    {a.status === "ready" ? "Анализ" : "Продолжить"} <ChevronRight />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Удалить попытку"
                  onClick={async () => {
                    if (!confirm("Удалить эту попытку?")) return;
                    await deleteAttempt(a);
                    setSel((s) => s.filter((x) => x !== a.id));
                    void qc.invalidateQueries();
                  }}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
              <StoredAudio audioKey={a.audio_reference} className="mt-3 h-10 w-full" />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <StorageNote />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm("Удалить тренировку и все её записи?")) return;
            await deletePractice(id);
            void qc.invalidateQueries();
            nav({ to: "/history" });
          }}
        >
          <Trash2 /> Удалить тренировку
        </Button>
      </div>
    </AppShell>
  );
}
