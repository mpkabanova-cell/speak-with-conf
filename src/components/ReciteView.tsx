import { Fragment } from "react";
import { compareRecitation } from "@/lib/recite";

export function ReciteView({ source, spoken }: { source: string; spoken: string }) {
  const r = compareRecitation(source, spoken);
  const exact = r.total > 0 && r.matched === r.total && r.extra === 0;
  const extra = (words: string[], key: string) =>
    words.length ? (
      <ins key={key} className="mx-0.5 rounded bg-sun-soft px-1 text-sun-deep no-underline decoration-dashed" title="Лишнее слово — его нет в тексте">
        +{words.join(" ")}
      </ins>
    ) : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
        {[
          ["Совпало", `${r.matched} из ${r.total}`],
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
        <p className="max-w-prose whitespace-pre-wrap text-[17px] leading-8">
          {r.tokens.map((t, i) => (
            <Fragment key={i}>
              {extra(t.extraBefore, `e${i}`)}
              {t.status === "missed" ? (
                <del className="rounded bg-destructive/10 px-0.5 text-destructive" title="Пропущено">{t.text}</del>
              ) : t.status === "wrong" ? (
                <span title={`Сказано: «${t.said}»`}>
                  <del className="rounded bg-destructive/10 px-0.5 text-destructive">{t.text}</del>
                  <span className="ml-0.5 rounded bg-sun-soft px-1 font-semibold text-sun-deep">{t.said}</span>
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
        <span className="rounded bg-sun-soft px-1 text-sun-deep">+слово</span> — лишнее. Регистр и знаки препинания не учитываются. Распознавание иногда ошибается — если слово сказано верно, исправь расшифровку ниже.
      </p>
    </div>
  );
}
