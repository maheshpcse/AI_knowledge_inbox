// Character bounds keep even non-English chunks comfortably below token limits.
export function chunkText(text, size = 1600, overlap = 240) {
  if (size <= overlap || overlap < 0) throw new Error('Invalid chunk bounds');
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const chunks = [];
  for (let start = 0; start < normalized.length;) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf('\n', end), normalized.lastIndexOf('. ', end), normalized.lastIndexOf(' ', end));
      if (boundary > start + size * 0.6) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = end - overlap;
  }
  return chunks;
}
export function cosine(a, b) {
  if (a.length !== b.length) return -1;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function retrieve(chunks, vector, limit = 5) {
  return chunks.map(c => ({ ...c, score: cosine(c.vector, vector) }))
    .filter(c => c.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, limit);
}
