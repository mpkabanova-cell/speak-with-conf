import { queryOptions } from "@tanstack/react-query";
import { getAttempt, getPractice, listAllAttempts, listAttempts, listPractices } from "./db";

const client = typeof window !== "undefined";

export const practicesQuery = () =>
  queryOptions({
    queryKey: ["practices"],
    queryFn: async () => {
      const [ps, as] = await Promise.all([listPractices(), listAllAttempts()]);
      return ps.map((p) => ({ ...p, attempts: as.filter((a) => a.practice_id === p.id).length }));
    },
    enabled: client,
  });

export const practiceQuery = (id: string) =>
  queryOptions({
    queryKey: ["practice", id],
    queryFn: async () => {
      const [practice, attempts] = await Promise.all([getPractice(id), listAttempts(id)]);
      return { practice: practice ?? null, attempts };
    },
    enabled: client,
  });

export const attemptQuery = (id: string) =>
  queryOptions({
    queryKey: ["attempt", id],
    queryFn: async () => {
      const attempt = await getAttempt(id);
      const practice = attempt ? await getPractice(attempt.practice_id) : undefined;
      const all = attempt ? await listAttempts(attempt.practice_id) : [];
      return { attempt: attempt ?? null, practice: practice ?? null, index: all.findIndex((a) => a.id === id) + 1 };
    },
    enabled: client,
  });
