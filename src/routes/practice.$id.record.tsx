import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mic, MicOff, RotateCcw, Sparkles, Square } from "lucide-react";
import { AppShell, AiNotice } from "@/components/AppShell";
import { LiveWave } from "@/components/Waveform";
import { Button } from "@/components/ui/button";
import { practiceQuery } from "@/lib/queries";
import { createAttempt, uid } from "@/lib/db";
import { fmtTime, fmtTimer } from "@/lib/audio-analysis";
import { PRACTICE_TYPES } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/practice/$id/record")({
  head: () => ({
    meta: [
      { title: "Запись выступления — Скажи уверенно" },
      { name: "description", content: "Запиши своё выступление через микрофон." },
      { property: "og:title", content: "Запись выступления — Скажи уверенно" },
      { property: "og:description", content: "Запиши своё выступление через микрофон." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecordPage,
});

type MicState = "idle" | "requesting" | "denied" | "notfound" | "unsupported" | "recording" | "recorded";
const BARS = 48;

function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

function RecordPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { data } = useQuery(practiceQuery(id));
  const [state, setState] = useState<MicState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.05));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef<number>(0);
  const t0 = useRef(0);
  const chunks = useRef<Blob[]>([]);

  const cleanup = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
  };
  useEffect(() => () => cleanup(), []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setState("unsupported");
    setState("requesting");
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException).name;
      setState(name === "NotFoundError" || name === "OverconstrainedError" ? "notfound" : "denied");
      return;
    }
    stream.current = s;
    const ac = new AudioContext();
    ctx.current = ac;
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(s).connect(an);
    const buf = new Float32Array(an.fftSize);

    const mime = pickMime();
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const b = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
      setBlob(b);
      setUrl(URL.createObjectURL(b));
      setState("recorded");
      cleanup();
    };
    r.start(250);
    rec.current = r;
    t0.current = performance.now();
    setElapsed(0);
    setBlob(null);
    setUrl(null);
    setState("recording");

    let last = 0;
    const tick = (now: number) => {
      setElapsed(now - t0.current);
      if (now - last > 60) {
        last = now;
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
        const rms = Math.sqrt(sum / buf.length);
        const lvl = Math.min(1, Math.max(0.04, (20 * Math.log10(rms + 1e-8) + 60) / 50));
        setLevels((l) => [...l.slice(1), lvl]);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  function stop() {
    rec.current?.state === "recording" && rec.current.stop();
  }

  function reset() {
    setBlob(null);
    setUrl(null);
    setElapsed(0);
    setLevels(Array(BARS).fill(0.05));
    setState("idle");
  }

  async function analyze() {
    if (!blob) return;
    setSaving(true);
    const attemptId = uid();
    try {
      await createAttempt(
        {
          id: attemptId,
          practice_id: id,
          created_at: Date.now(),
          duration_ms: Math.round(elapsed),
          status: "recorded",
          transcript: null,
          transcript_edited: false,
          chunks: null,
          word_count: null,
          speech_rate: null,
          filler_words: null,
          pauses: null,
          speech_start: null,
          speech_end: null,
          structure_analysis: null,
          recommendations: null,
          audio_reference: attemptId,
          audio_type: blob.type,
        },
        blob,
      );
      nav({ to: "/attempt/$id", params: { id: attemptId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить запись");
      setSaving(false);
    }
  }

  const p = data?.practice;
  const recording = state === "recording";
  const target = p?.target_duration ? p.target_duration * 1000 : null;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-xl flex-col items-center pt-4 text-center">
        <Link to={p ? "/practice/$id" : "/"} params={{ id }} className="self-start text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 inline size-4" /> Вернуться
        </Link>
        {p && (
          <div className={cn("mt-6 transition-opacity", recording && "opacity-60")}>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-deep">{PRACTICE_TYPES[p.type].label}</p>
            <h1 className="mt-2 text-xl font-bold md:text-2xl">{p.prompt}</h1>
          </div>
        )}

        <p className={cn("num mt-12 text-7xl font-extrabold md:text-8xl", recording ? "text-foreground" : "text-muted-foreground")}>
          {fmtTimer(elapsed)}
        </p>
        {target && (
          <p className="mt-2 text-sm text-muted-foreground">
            цель {fmtTime(target / 1000)}
            {elapsed > target && <span className="ml-1 font-semibold text-sun-deep">· время вышло</span>}
          </p>
        )}

        <div className="mt-8 w-full">
          <LiveWave levels={levels} active={recording} />
        </div>

        <p className="mt-4 h-5 text-sm font-semibold" aria-live="polite">
          {state === "idle" && <span className="text-muted-foreground">Микрофон не активен</span>}
          {state === "requesting" && <span className="text-muted-foreground">Разреши доступ к микрофону…</span>}
          {recording && (
            <span className="inline-flex items-center gap-2 text-record-foreground">
              <span className="size-2 rounded-full bg-record animate-pulse" /> Идёт запись
            </span>
          )}
          {state === "recorded" && <span className="text-brand-deep">Запись завершена</span>}
        </p>

        {(state === "denied" || state === "notfound" || state === "unsupported") && (
          <div className="mt-6 w-full rounded-2xl bg-sun-soft p-5 text-left text-sm">
            <p className="flex items-center gap-2 font-bold"><MicOff className="size-4" />
              {state === "denied" ? "Нет доступа к микрофону" : state === "notfound" ? "Микрофон не найден" : "Запись не поддерживается"}
            </p>
            <p className="mt-2 text-muted-foreground">
              {state === "denied"
                ? "Нажми на значок замка или микрофона в адресной строке браузера, разреши доступ к микрофону для этого сайта и обнови страницу."
                : state === "notfound"
                  ? "Подключи микрофон или гарнитуру и попробуй снова. Проверь, что микрофон не занят другой программой."
                  : "Этот браузер не умеет записывать звук. Открой сайт в свежей версии Chrome, Edge, Firefox или Safari."}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setState("idle")}>Попробовать снова</Button>
          </div>
        )}

        {!recording && state !== "recorded" && (
          <div className="mt-8 w-full rounded-2xl bg-muted p-4 text-left">
            <AiNotice />
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-4">
          {(state === "idle" || state === "requesting") && (
            <Button size="lg" className="h-16 rounded-full px-10 text-lg" onClick={start} disabled={state === "requesting"}>
              <Mic className="!size-5" /> Начать запись
            </Button>
          )}
          {recording && (
            <Button size="lg" variant="record" className="h-16 rounded-full px-10 text-lg animate-pulse-ring" onClick={stop}>
              <Square className="!size-5 fill-current" /> Завершить
            </Button>
          )}
          {state === "recorded" && url && (
            <>
              <audio controls src={url} className="w-full max-w-md" />
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={analyze} disabled={saving}><Sparkles /> Проанализировать</Button>
                <Button size="lg" variant="outline" onClick={reset} disabled={saving}><RotateCcw /> Перезаписать</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
