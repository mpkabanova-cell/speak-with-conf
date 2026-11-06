import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BrandWave } from "@/components/Waveform";
import { Button } from "@/components/ui/button";
import { practicesQuery } from "@/lib/queries";
import { PRACTICE_TYPES } from "@/lib/types";
import { plural } from "@/lib/analysis";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Говори уверенно — говори увереннее с каждой попыткой" },
      { name: "description", content: "Запиши выступление, узнай, что можно улучшить, и сравни свой результат. Тренажёр устной речи для 5–11 классов." },
      { property: "og:title", content: "Говори уверенно — тренажёр устных выступлений" },
      { property: "og:description", content: "Запиши выступление, узнай, что можно улучшить, и сравни свой результат." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { data } = useQuery(practicesQuery());
  const recent = (data ?? []).slice(0, 4);
  return (
    <AppShell>
      <section className="grid items-center gap-10 pt-10 md:grid-cols-[1.2fr_1fr] md:pt-20">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-deep">
            Тренажёр устных выступлений
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.05] md:text-6xl">
            Говори увереннее с&nbsp;каждой попыткой
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Запиши выступление, узнай, что можно улучшить, и сравни свой результат.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/new">
                Начать тренировку <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/history">Мои тренировки</Link>
            </Button>
          </div>
        </div>
        <div className="flex justify-center rounded-3xl bg-brand-soft p-10 md:p-14">
          <BrandWave />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mt-20">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Последние тренировки</h2>
            <Link to="/history" className="text-sm font-semibold text-brand-deep hover:underline">
              Все
            </Link>
          </div>
          <ul className="divide-y rounded-2xl border">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  to="/practice/$id"
                  params={{ id: p.id }}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {PRACTICE_TYPES[p.type].label} · {p.attempts} {plural(p.attempts, "попытка", "попытки", "попыток")}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
