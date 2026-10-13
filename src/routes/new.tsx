import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { MessageCircleQuestion, BookOpen, Presentation, ArrowRight } from "lucide-react";
import { AppShell, StorageNote } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePractice, uid } from "@/lib/db";
import { PRACTICE_TYPES, type PracticeType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "Новая тренировка — Скажи уверенно" },
      { name: "description", content: "Выбери формат выступления и тему, чтобы начать тренировку." },
      { property: "og:title", content: "Новая тренировка — Скажи уверенно" },
      { property: "og:description", content: "Ответ на вопрос, пересказ или защита проекта." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewPractice,
});

const icons = { answer: MessageCircleQuestion, retelling: BookOpen, project: Presentation };

const schema = z.object({
  type: z.enum(["answer", "retelling", "project"]),
  prompt: z.string().trim().min(3, "Напиши тему или вопрос — хотя бы пару слов").max(300, "Слишком длинная тема"),
  minutes: z.number().min(0).max(30).nullable(),
});

function NewPractice() {
  const nav = useNavigate();
  const [type, setType] = useState<PracticeType>("answer");
  const [prompt, setPrompt] = useState("");
  const [minutes, setMinutes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const m = minutes.trim() ? Number(minutes.replace(",", ".")) : null;
    const parsed = schema.safeParse({ type, prompt, minutes: m !== null && Number.isFinite(m) ? m : null });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? "Проверь поля");
    const id = uid();
    try {
      await savePractice({
        id,
        title: parsed.data.prompt.slice(0, 80),
        type,
        prompt: parsed.data.prompt,
        target_duration: parsed.data.minutes ? Math.round(parsed.data.minutes * 60) : null,
        created_at: Date.now(),
      });
      nav({ to: "/practice/$id/record", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить тренировку");
    }
  }

  return (
    <AppShell>
      <form onSubmit={submit} className="mx-auto max-w-2xl pt-6">
        <h1 className="text-3xl font-extrabold">Новая тренировка</h1>
        <p className="mt-2 text-muted-foreground">Все попытки по этой теме будут собраны вместе.</p>

        <Label className="mt-10 block text-sm font-bold">Формат выступления</Label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRACTICE_TYPES) as PracticeType[]).map((t) => {
            const Icon = icons[t];
            const active = t === type;
            return (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all",
                  active ? "border-brand bg-brand-soft ring-1 ring-brand" : "hover:border-brand-light",
                )}
              >
                <Icon className={cn("size-5", active ? "text-brand-deep" : "text-muted-foreground")} />
                <p className="mt-3 font-bold">{PRACTICE_TYPES[t].label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{PRACTICE_TYPES[t].hint}</p>
              </button>
            );
          })}
        </div>

        <Label htmlFor="prompt" className="mt-8 block text-sm font-bold">
          Тема или вопрос
        </Label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setErr(null); }}
          placeholder={type === "answer" ? "Почему происходит смена времён года?" : type === "retelling" ? "Пересказ параграфа о Петре I" : "Проект «Вторая жизнь пластика»"}
          className="mt-2 min-h-24 rounded-xl text-base"
        />

        <Label htmlFor="min" className="mt-6 block text-sm font-bold">
          Желаемая продолжительность, мин <span className="font-normal text-muted-foreground">— необязательно</span>
        </Label>
        <Input id="min" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="например, 3" className="mt-2 h-11 max-w-40 rounded-xl" />

        {err && <p className="mt-4 text-sm font-semibold text-destructive">{err}</p>}

        <div className="mt-10 flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <StorageNote />
          <Button size="lg" type="submit">
            Перейти к записи <ArrowRight />
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
