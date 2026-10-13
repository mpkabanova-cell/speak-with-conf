import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { AppShell, StorageNote } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { practicesQuery } from "@/lib/queries";
import { deletePractice } from "@/lib/db";
import { PRACTICE_TYPES } from "@/lib/types";
import { plural } from "@/lib/analysis";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Мои тренировки — Скажи уверенно" },
      { name: "description", content: "История тренировок и попыток устных выступлений." },
      { property: "og:title", content: "Мои тренировки — Скажи уверенно" },
      { property: "og:description", content: "Сохранённые тренировки и попытки." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

function History() {
  const { data, isLoading } = useQuery(practicesQuery());
  const qc = useQueryClient();
  return (
    <AppShell>
      <div className="flex items-end justify-between pt-6">
        <div>
          <h1 className="text-3xl font-extrabold">Мои тренировки</h1>
          <div className="mt-2"><StorageNote /></div>
        </div>
        <Button asChild><Link to="/new"><Plus /> Новая</Link></Button>
      </div>
      {isLoading || !data ? (
        <div className="mt-8 h-40 animate-pulse rounded-2xl bg-muted" />
      ) : data.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-surface p-10 text-center">
          <p className="font-bold">Пока нет тренировок</p>
          <p className="mt-1 text-sm text-muted-foreground">Запиши первое выступление — здесь появится история.</p>
          <Button asChild className="mt-5"><Link to="/new">Начать тренировку</Link></Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y rounded-2xl border">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-2 pr-2">
              <Link to="/practice/$id" params={{ id: p.id }} className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4 hover:bg-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {PRACTICE_TYPES[p.type].label} · {p.attempts} {plural(p.attempts, "попытка", "попытки", "попыток")} ·{" "}
                    {new Date(p.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Удалить тренировку"
                onClick={async () => {
                  if (!confirm("Удалить тренировку и все её записи?")) return;
                  await deletePractice(p.id);
                  void qc.invalidateQueries();
                }}
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
