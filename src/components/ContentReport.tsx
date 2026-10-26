import { Check, X } from "lucide-react";
import { accuracyVerdict } from "@/lib/subject-analysis";
import type { Practice, StructureAnalysis } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ContentReport({ analysis, practice }: { analysis: StructureAnalysis; practice: Practice }) {
  const accuracy = analysis.accuracy;
  const verdict = accuracy ? accuracyVerdict(accuracy.findings) : null;
  const errors = accuracy?.findings.filter(f => f.status === "error") ?? [];
  const uncertain = accuracy?.findings.filter(f => f.status === "uncertain") ?? [];
  const correct = analysis.claims?.filter(c => c.status === "correct") ?? [];
  const source = accuracy?.basis === "source";

  return (
    <div className="mt-4 space-y-7">
      <div className="border-y py-5">
        <h3 className={cn("text-lg font-bold", errors.length ? "text-destructive" : "text-foreground")}>{verdict?.label ?? "Результат проверки"}</h3>
        <p className="mt-2 text-sm">{accuracy?.summary ?? analysis.summary}</p>
        <p className="mt-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Основание проверки: </span>{source ? (practice.type === "project" ? "добавленные материалы проекта" : "добавленный исходный текст") : "школьные предметные знания. Исходный материал не добавлен; сравнение с образцом ответа не проводилось."}</p>
        {source && practice.source_text && <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">{practice.type === "project" ? "Посмотреть материалы проекта" : "Посмотреть исходный текст"}</summary>
          <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{practice.source_text}</p>
        </details>}
      </div>

      {errors.length > 0 && <section>
        <h3 className="text-lg font-bold">Ошибки и исправления</h3>
        <ol className="mt-3 divide-y">
          {errors.map((finding, i) => <li key={i} className="py-4 first:pt-0">
            <p className="text-sm font-bold text-destructive">Ошибка {i + 1}</p>
            <p className="mt-2 text-sm"><span className="font-semibold">В ответе: </span>«{finding.quote}»</p>
            <p className="mt-2 text-sm text-muted-foreground">{finding.explanation}</p>
            {finding.source_quote && <p className="mt-2 text-sm"><span className="font-semibold">В материалах: </span>«{finding.source_quote}»</p>}
            {finding.correction && <p className="mt-3 border-l-2 border-brand pl-3 text-sm"><span className="font-bold text-brand-deep">Как правильно: </span>{finding.correction}</p>}
          </li>)}
        </ol>
      </section>}

      {uncertain.length > 0 && <section>
        <h3 className="text-lg font-bold text-sun-deep">Нужно уточнить · {uncertain.length}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Это не подтверждённые ошибки. Причиной может быть неточная расшифровка или недостаток данных.</p>
        <ul className="mt-3 divide-y">{uncertain.map((finding, i) => <li key={i} className="py-3">
          <p className="text-sm italic">«{finding.quote}»</p>
          <p className="mt-2 text-sm text-muted-foreground">{finding.explanation}</p>
          {finding.source_quote && <p className="mt-2 text-sm">В материалах: «{finding.source_quote}»</p>}
          {finding.correction && <p className="mt-2 text-sm font-semibold">{finding.correction}</p>}
        </li>)}</ul>
      </section>}

      {analysis.relevance && <section className="border-t pt-5">
        <h3 className="text-lg font-bold">Соответствие теме</h3>
        <p className="mt-2 font-semibold">{{ on_topic: "Ответ соответствует теме", partial: "Ответ частично соответствует теме", off_topic: "Ответ не соответствует теме", uncertain: "Не удалось определить соответствие теме" }[analysis.relevance.status]}</p>
        <p className="mt-1 text-sm text-muted-foreground">{analysis.relevance.explanation}</p>
      </section>}

      {correct.length > 0 && <section>
        <h3 className="text-lg font-bold">Верные утверждения</h3>
        <ul className="mt-2 divide-y">{correct.map((claim, i) => <li key={i} className="py-3">
          <p className="text-sm italic">«{claim.quote}»</p>
          <p className="mt-1 text-sm text-muted-foreground">{claim.explanation}</p>
        </li>)}</ul>
      </section>}

      <section className="border-t pt-5">
        <h3 className="text-lg font-bold">Структура ответа</h3>
        <p className="mt-2 text-sm text-muted-foreground">Отдельно от предметной точности: какие части ответа есть и чего не хватает.</p>
        <ul className="mt-4 divide-y">{analysis.elements.map((element, i) => <li key={i} className="flex gap-3 py-4">
          <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", element.found ? "bg-brand text-primary-foreground" : "bg-sun-soft text-sun-deep")}>
            {element.found ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="font-bold">{element.name} <span className={cn("ml-1 text-sm font-semibold", element.found ? "text-brand-deep" : "text-sun-deep")}>{element.found ? "есть" : "не обнаружено"}</span></p>
            <p className="mt-1 text-sm text-muted-foreground">{element.comment}</p>
            {element.evidence && <p className="mt-2 border-l-2 border-brand-light pl-3 text-sm italic">«{element.evidence}»</p>}
          </div>
        </li>)}</ul>
        {analysis.sequence_issues.length > 0 && <div className="mt-4">
          <h4 className="font-bold">Порядок изложения</h4>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{analysis.sequence_issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
        </div>}
      </section>
      <p className="text-xs text-muted-foreground">Проверка может ошибаться. Спорные утверждения проверь с учителем или по учебнику.</p>
    </div>
  );
}