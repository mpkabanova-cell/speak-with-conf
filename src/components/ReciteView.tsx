import { Fragment } from "react";
import { compareRecitation, wordIndexOf } from "@/lib/recite";

export function ReciteView({
  source,
  spoken,
  accepted = [],
  onAccept,
}: {
  source: string;
  spoken: string;
  accepted?: number[];
  onAccept?: (wordIndex: number) => void;
}) {
  const r = compareRecitation(source, spoken, accepted);
  const exact = r.total > 0 && r.matched === r.total && r.extra === 0;
  const extra = (words: string[], key: string) =>
    words.length ? (
      <ins key={key} className="mx-0.5 rounded bg-sun-soft px-1 text-sun-deep no-underline decoration-dashed" title="Лишнее слово — его нет в тексте">
        +{words.join(" ")}
      </ins>
    ) : null;
  const accept = (i: number) =>
    onAccept ? (
      <button
        type="button"
        onClick={() => onAccept(wordIndexOf(r.tokens, i))}
        className="ml-0.5 rounded border border-brand px-1 text-xs font-semibold text-brand-deep hover:bg-brand-soft"
        title="Я сказал это слово правильно — ошибся распознаватель"
      >
        ✓
      </button>
    ) : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-5">
        {[
          ["Совпало", `${r.matched} из ${r.total}`],
          ["Неуверенно", r.fuzzy],
          ["Пропущено", r.missed],
          ["Сказано иначе", r.wrong],
          ["Лишних слов", r.extra],
        ].map(([l, v]) => (
          <div key={String(l)} className="bg-background p-4">
            <p className="text-xs font-semibold text-muted-foreground">{l}</p>
            <p className="num mt-1 text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>
      {exact && <p className="mt-3 font-semibold text-brand-deep">Текст рассказан слово в слово.</p>}
      <div className="mt-4 rounded-2xl bg-surface p-5 md:p-7">
        <p className="max-w-prose whitespace-pre-wrap text-[17px] leading-9">
          {r.tokens.map((t, i) => (
            <Fragment key={i}>
              {extra(t.extraBefore, `e${i}`)}
              {t.status === "missed" ? (
                <span>
                  <del className="rounded bg-destructive/10 px-0.5 text-destructive" title="Пропущено">{t.text}</del>
                  {accept(i)}
                </span>
              ) : t.status === "wrong" ? (
                <span title={`Сказано: «${t.said}»`}>
                  <del className="rounded bg-destructive/10 px-0.5 text-destructive">{t.text}</del>
                  <span className="ml-0.5 rounded bg-sun-soft px-1 font-semibold text-sun-deep">{t.said}</span>
                  {accept(i)}
                </span>
              ) : t.status === "fuzzy" ? (
                <span title={`Распознано как «${t.said}» — возможно, ошибка распознавания`}>
                  <span className="rounded border-b-2 border-dashed border-sun px-0.5">{t.text}</span>
                  {accept(i)}
                </span>
              ) : (
                t.text
              )}
              {t.sep}
            </Fragment>
          ))}
          {extra(r.extraEnd, "end")}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <del className="rounded bg-destructive/10 px-0.5 text-destructive">Зачёркнуто</del> — пропущено или сказано не так,{" "}
        <span className="rounded bg-sun-soft px-1 font-semibold text-sun-deep">рядом</span> — что прозвучало вместо,{" "}
        <span className="rounded border-b-2 border-dashed border-sun px-0.5">пунктир</span> — распознано неуверенно,{" "}
        <span className="rounded bg-sun-soft px-1 text-sun-deep">+слово</span> — лишнее. Небольшие ошибки распознавания засчитываются автоматически. Если слово сказано верно, нажми ✓ рядом с ним.
      </p>
    </div>
  );
}
