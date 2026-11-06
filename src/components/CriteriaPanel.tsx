import { ChevronDown, FileUp, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { projectCriteria } from "@/lib/subject-analysis";
import { cn } from "@/lib/utils";

export function CriteriaPanel({ hasSource, custom, onChange, className }: { hasSource: boolean; custom?: string | null | undefined; onChange?: (v: string) => void; className?: string }) {
  const { base, custom: list } = projectCriteria(hasSource, custom);
  async function onFile(file?: File) {
    if (!file || !onChange) return;
    if (!(/^text\//i.test(file.type) || /\.(txt|md|csv)$/i.test(file.name))) return toast.error("Подойдёт текстовый файл (.txt, .md)");
    if (file.size > 200 * 1024) return toast.error("Файл слишком большой — до 200 КБ");
    onChange((await file.text()).trim().slice(0, 5000));
    return undefined;
  }
  return (
    <details className={cn("group rounded-2xl border bg-card", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-bold">
        <ListChecks className="size-4 text-brand-deep" />
        Критерии оценки записи
        <span className="text-sm font-normal text-muted-foreground">· {base.length + list.length}</span>
        <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t p-4 text-sm">
        <p className="text-muted-foreground">По этим пунктам проверяется выступление:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {base.map((c) => <li key={c}>{c}</li>)}
          {!onChange && list.map((c, i) => <li key={i} className="font-semibold text-brand-deep">{c}</li>)}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Также проверяется предметная точность утверждений.</p>
        {onChange && (
          <div className="mt-4">
            <p className="font-bold">Свои критерии <span className="font-normal text-muted-foreground">— необязательно, каждый с новой строки</span></p>
            <Button type="button" variant="outline" size="sm" className="mt-2" asChild>
              <label className="cursor-pointer">
                <FileUp /> Загрузить файл
                <input type="file" accept=".txt,.md,.csv,text/plain" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </Button>
            <Textarea value={custom ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={"Например:\nЕсть презентация результатов\nУложился в 5 минут"} className="mt-2 min-h-28 rounded-xl" />
          </div>
        )}
      </div>
    </details>
  );
}
