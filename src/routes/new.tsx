import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { MessageCircleQuestion, BookOpen, Presentation, ArrowRight, ScrollText, Camera, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, StorageNote } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePractice, uid } from "@/lib/db";
import { LANGUAGES, PRACTICE_TYPES, type LanguageCode, type PracticeType } from "@/lib/types";
import { extractSourceText } from "@/lib/structure.functions";
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

const icons = { answer: MessageCircleQuestion, retelling: BookOpen, project: Presentation, memorize: ScrollText };

function detectLang(t: string): LanguageCode | null {
  const cyr = (t.match(/[а-яё]/gi) ?? []).length, lat = (t.match(/[a-z]/gi) ?? []).length;
  if (cyr + lat < 10) return null;
  if (cyr >= lat) return "russian";
  if (/[äöüß]/i.test(t)) return "german";
  if (/[ñ¿¡]/i.test(t)) return "spanish";
  if (/[àâçèéêëîïôûœ]/i.test(t)) return "french";
  return "english";
}

async function toBase64(file: File): Promise<{ mime: "image/jpeg" | "application/pdf"; data: string }> {
  if (file.type === "application/pdf") {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mime: "application/pdf", data: btoa(bin) };
  }
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return { mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.88).split(",")[1] };
}

const schema = z.object({
  type: z.enum(["answer", "retelling", "project", "memorize"]),
  prompt: z.string().trim().min(3, "Напиши тему или вопрос — хотя бы пару слов").max(300, "Слишком длинная тема"),
  minutes: z.number().min(0).max(30).nullable(),
});

function NewPractice() {
  const nav = useNavigate();
  const [type, setType] = useState<PracticeType>("answer");
  const [prompt, setPrompt] = useState("");
  const [minutes, setMinutes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [lang, setLang] = useState<LanguageCode>("russian");
  const [langTouched, setLangTouched] = useState(false);
  const [reading, setReading] = useState(false);
  const extract = useServerFn(extractSourceText);
  const needsSource = type === "memorize";
  const showSource = type === "retelling" || type === "memorize";

  function onSourceChange(t: string) {
    setSource(t);
    setErr(null);
    const d = detectLang(t);
    if (d && !langTouched) setLang(d);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast.error("Файл слишком большой — до 15 МБ");
    if (/^text\/|\.(txt|md)$/i.test(file.type || file.name)) return onSourceChange((await file.text()).trim());
    if (!(file.type.startsWith("image/") || file.type === "application/pdf"))
      return toast.error("Подойдёт фото, PDF или текстовый файл (.txt)");
    setReading(true);
    try {
      const { mime, data } = await toBase64(file);
      const r = await extract({ data: { mime, data, filename: file.name.slice(0, 200) } });
      if (!r.ok) return toast.error(r.error);
      setSource(r.result.text.trim());
      if (!langTouched) setLang(r.result.language);
      toast.success("Текст распознан — проверь его и исправь, если нужно");
    } catch {
      toast.error("Не удалось прочитать файл. Попробуй другое фото или вставь текст вручную.");
    } finally {
      setReading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const m = minutes.trim() ? Number(minutes.replace(",", ".")) : null;
    const parsed = schema.safeParse({ type, prompt, minutes: m !== null && Number.isFinite(m) ? m : null });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? "Проверь поля");
    const src = source.trim();
    if (needsSource && src.split(/\s+/).length < 2) return setErr("Для режима «Наизусть» добавь текст, который нужно рассказать");
    if (src.length > 20000) return setErr("Текст слишком длинный — до 20 000 символов");
    const id = uid();
    try {
      await savePractice({
        id,
        title: parsed.data.prompt.slice(0, 80),
        type,
        prompt: parsed.data.prompt,
        target_duration: parsed.data.minutes ? Math.round(parsed.data.minutes * 60) : null,
        created_at: Date.now(),
        source_text: showSource && src ? src : null,
        language: type === "memorize" ? lang : "russian",
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
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          {type === "memorize" ? "Название текста" : "Тема или вопрос"}
        </Label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setErr(null); }}
          placeholder={type === "memorize" ? "А. С. Пушкин «Зимнее утро»" : type === "answer" ? "Почему происходит смена времён года?" : type === "retelling" ? "Пересказ параграфа о Петре I" : "Проект «Вторая жизнь пластика»"}
          className="mt-2 min-h-24 rounded-xl text-base"
        />

        {showSource && (
          <div className="mt-8">
            <Label htmlFor="source" className="block text-sm font-bold">
              {needsSource ? "Текст, который нужно рассказать" : "Исходный текст"}{" "}
              <span className="font-normal text-muted-foreground">{needsSource ? "— обязательно" : "— необязательно, чтобы проверить полноту пересказа"}</span>
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={reading} asChild>
                <label className="cursor-pointer">
                  <Camera /> Фото
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={reading} asChild>
                <label className="cursor-pointer">
                  <FileUp /> Файл
                  <input type="file" accept=".txt,.md,text/plain,application/pdf,image/*" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </Button>
              {reading && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Распознаю текст…</span>}
            </div>
            <Textarea
              id="source"
              value={source}
              onChange={(e) => onSourceChange(e.target.value)}
              placeholder="Вставь текст или загрузи фото / файл"
              className="mt-2 min-h-40 rounded-xl text-base leading-7"
            />
            <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-deep" />
              Фото и PDF отправляются во внешний ИИ-сервис только для распознавания текста. Проверь результат — сверка идёт именно с ним.
            </p>
            {type === "memorize" && (
              <div className="mt-5">
                <Label className="block text-sm font-bold">Язык текста</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <button
                      type="button"
                      key={l.code}
                      onClick={() => { setLang(l.code); setLangTouched(true); }}
                      className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", lang === l.code ? "border-brand bg-brand-soft text-brand-deep" : "hover:border-brand-light")}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
