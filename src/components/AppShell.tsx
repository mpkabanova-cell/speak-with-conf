import { Link } from "@tanstack/react-router";
import { AudioLines, History } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <AudioLines className="size-4" />
          </span>
          Скажи уверенно
        </Link>
        <Link
          to="/history"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          activeProps={{ className: "bg-accent text-accent-foreground" }}
        >
          <History className="size-4" /> Мои тренировки
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-20">{children}</main>
    </div>
  );
}

export function StorageNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Записи хранятся только в этом браузере и могут исчезнуть при очистке его данных.
    </p>
  );
}
