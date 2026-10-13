import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Attempt, Practice } from "./types";

interface SpeechDB extends DBSchema {
  practices: { key: string; value: Practice };
  attempts: { key: string; value: Attempt; indexes: { by_practice: string } };
  audio: { key: string; value: Blob };
}

let dbPromise: Promise<IDBPDatabase<SpeechDB>> | null = null;

function db() {
  if (typeof indexedDB === "undefined") throw new Error("Хранилище браузера недоступно");
  dbPromise ??= openDB<SpeechDB>("skazhi-uverenno", 1, {
    upgrade(d) {
      d.createObjectStore("practices", { keyPath: "id" });
      const a = d.createObjectStore("attempts", { keyPath: "id" });
      a.createIndex("by_practice", "practice_id");
      d.createObjectStore("audio");
    },
  });
  return dbPromise;
}

export const uid = () => crypto.randomUUID();

function wrapQuota<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e && (e.name === "QuotaExceededError" || /quota/i.test(String(e.message)))) {
      throw new Error("Недостаточно места в браузере для сохранения. Удали старые попытки и попробуй снова.");
    }
    throw e;
  });
}

export async function listPractices(): Promise<Practice[]> {
  const all = await (await db()).getAll("practices");
  return all.sort((a, b) => b.created_at - a.created_at);
}
export async function getPractice(id: string) {
  return (await db()).get("practices", id);
}
export async function savePractice(p: Practice) {
  await wrapQuota((await db()).put("practices", p));
}
export async function deletePractice(id: string) {
  const d = await db();
  const attempts = await d.getAllFromIndex("attempts", "by_practice", id);
  const tx = d.transaction(["practices", "attempts", "audio"], "readwrite");
  for (const a of attempts) {
    await tx.objectStore("attempts").delete(a.id);
    await tx.objectStore("audio").delete(a.audio_reference);
  }
  await tx.objectStore("practices").delete(id);
  await tx.done;
}

export async function listAttempts(practiceId: string): Promise<Attempt[]> {
  const all = await (await db()).getAllFromIndex("attempts", "by_practice", practiceId);
  return all.sort((a, b) => a.created_at - b.created_at);
}
export async function listAllAttempts(): Promise<Attempt[]> {
  return (await db()).getAll("attempts");
}
export async function getAttempt(id: string) {
  return (await db()).get("attempts", id);
}
export async function saveAttempt(a: Attempt) {
  await wrapQuota((await db()).put("attempts", a));
}
export async function createAttempt(a: Attempt, audio: Blob) {
  const d = await db();
  const tx = d.transaction(["attempts", "audio"], "readwrite");
  await wrapQuota(
    Promise.all([tx.objectStore("audio").put(audio, a.audio_reference), tx.objectStore("attempts").put(a), tx.done]),
  );
}
export async function deleteAttempt(a: Attempt) {
  const d = await db();
  const tx = d.transaction(["attempts", "audio"], "readwrite");
  await tx.objectStore("attempts").delete(a.id);
  await tx.objectStore("audio").delete(a.audio_reference);
  await tx.done;
}
export async function getAudio(key: string) {
  return (await db()).get("audio", key);
}
