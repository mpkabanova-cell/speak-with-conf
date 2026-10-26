export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF"); view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const value of chunk) {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
    offset += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}