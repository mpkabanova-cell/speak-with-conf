import { useEffect, useState } from "react";
import { getAudio } from "@/lib/db";

export function StoredAudio({ audioKey, className }: { audioKey: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    void getAudio(audioKey).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [audioKey]);
  if (!url) return <div className="h-12 rounded-lg bg-muted" />;
  return <audio controls src={url} className={className ?? "w-full"} />;
}
