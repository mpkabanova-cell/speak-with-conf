export type PracticeType = "answer" | "retelling" | "project";

export const PRACTICE_TYPES: Record<PracticeType, { label: string; hint: string }> = {
  answer: { label: "Ответ на вопрос", hint: "Объясни тему или ответь на учебный вопрос" },
  retelling: { label: "Пересказ", hint: "Перескажи прочитанный или изученный материал" },
  project: { label: "Защита проекта", hint: "Подготовься к выступлению на защите" },
};

export interface Practice {
  id: string;
  title: string;
  type: PracticeType;
  prompt: string;
  target_duration: number | null; // seconds
  created_at: number;
}

export interface FillerHit {
  word: string; // canonical form
  start: number; // char index in transcript
  end: number;
}

export interface Pause {
  start: number; // seconds
  end: number;
  duration: number;
}

export interface TranscriptChunk {
  text: string;
  start: number;
  end: number | null;
}

export interface StructureElement {
  name: string;
  found: boolean;
  evidence: string | null;
  comment: string;
}

export interface StructureAnalysis {
  elements: StructureElement[];
  sequence_issues: string[];
  recommendations: string[];
  summary: string;
  transcript_hash: string;
}

export interface Recommendation {
  text: string;
  source: "speech" | "structure";
}

export type AttemptStatus = "recorded" | "transcribing" | "ready" | "error";

export interface Attempt {
  id: string;
  practice_id: string;
  created_at: number;
  duration_ms: number;
  status: AttemptStatus;
  error?: string | null;
  transcript: string | null;
  transcript_edited: boolean;
  chunks: TranscriptChunk[] | null;
  word_count: number | null;
  speech_rate: number | null;
  filler_words: FillerHit[] | null;
  pauses: Pause[] | null;
  speech_start: number | null;
  speech_end: number | null;
  structure_analysis: StructureAnalysis | null;
  recommendations: Recommendation[] | null;
  audio_reference: string; // key in audio store
  audio_type: string;
}
