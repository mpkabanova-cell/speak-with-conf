import { createFileRoute } from "@tanstack/react-router";

const hits = new Map<string, number[]>();
export const Route = createFileRoute("/api/public/transcribe")({
  server: { handlers: { POST: async ({ request }) => {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) return Response.json({ error: { message: "Отправка доступна только из приложения." } }, { status: 403 });
    const key = request.headers.get("cf-connecting-ip") ?? "preview";
    const now = Date.now();
    const times = (hits.get(key) ?? []).filter(t => now - t < 60_000);
    if (times.length >= 6) return Response.json({ error: { message: "Слишком много запросов. Подожди минуту." } }, { status: 429, headers: { "Retry-After": "60" } });
    times.push(now); hits.set(key, times);
    if (hits.size > 5000) hits.clear();
    try {
      const { boundedForm, transcribeAudio } = await import("@/lib/transcription.server");
      const form = await boundedForm(request);
      if (form.get("consent") !== "yes" || form.get("mode") !== "memorize") return Response.json({ error: { message: "Нужно согласие на отправку аудио для режима «Наизусть»." } }, { status: 400 });
      const file = form.get("file");
      const language = form.get("language");
      if (!(file instanceof File) || typeof language !== "string" || !["ru", "en", "de", "fr", "es", "it"].includes(language)) return Response.json({ error: { message: "Не удалось прочитать запись или язык." } }, { status: 400 });
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) return Response.json({ error: { message: "Облачное распознавание не настроено." } }, { status: 401 });
      const response = await transcribeAudio(file, language, apiKey, request.signal);
      const headers = new Headers({ "Content-Type": response.headers.get("content-type") ?? "text/event-stream", "Cache-Control": "no-cache, no-transform" });
      response.headers.forEach((value, name) => { if (name.toLowerCase().startsWith("x-lovable-aig-") || name.toLowerCase() === "retry-after") headers.set(name, value); });
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      const message = error instanceof Error ? error.message : "";
      return Response.json({ error: { message: message === "UPLOAD_TOO_LARGE" ? "Запись слишком большая. Запиши более короткий фрагмент." : "Не удалось отправить аудиозапись. Проверь запись и соединение." } }, { status: message === "UPLOAD_TOO_LARGE" ? 413 : 400 });
    }
  } } },
});