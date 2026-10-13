import { cn } from "@/lib/utils";

/** Decorative brand wave for the home screen. */
export function BrandWave({ className }: { className?: string }) {
  const bars = [0.3, 0.5, 0.8, 0.45, 1, 0.7, 0.4, 0.9, 0.6, 0.35, 0.75, 0.5, 0.95, 0.55, 0.3, 0.65, 0.85, 0.4, 0.6, 0.3];
  return (
    <div className={cn("flex h-24 items-center gap-1.5", className)} aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn("w-2 rounded-full animate-wave-idle origin-center", i % 3 === 0 ? "bg-brand-light" : "bg-brand")}
          style={{ height: `${h * 100}%`, animationDelay: `${(i * 97) % 1200}ms` }}
        />
      ))}
    </div>
  );
}

/** Live level-driven wave. `levels` are 0..1 values from the analyser, newest last. */
export function LiveWave({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-28 w-full items-center justify-center gap-[3px]" aria-hidden>
      {levels.map((l, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full transition-[height] duration-75", active ? "bg-brand" : "bg-border")}
          style={{ height: `${Math.max(6, Math.min(100, l * 100))}%` }}
        />
      ))}
    </div>
  );
}
