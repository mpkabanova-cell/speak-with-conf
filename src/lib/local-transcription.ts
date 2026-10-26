/** Only inference gets a quiet tail; stored audio and measured duration stay unchanged. */
export function withQuietTail(samples: Float32Array) {
  const padded = new Float32Array(samples.length + 16000);
  padded.set(samples);
  return padded;
}

/** Timestamp chunks may omit a final word: the recognizer's full text is authoritative. */
export function completeTranscript(result: { text: string; chunks: { text: string }[] }) {
  return result.text.trim() || result.chunks.map(c => c.text).join("").trim();
}