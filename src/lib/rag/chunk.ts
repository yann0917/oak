/**
 * 中文短文本切块：优先按句子边界（句号/感叹号/问号/分号/换行）切，
 * 单块上限 MAX_CHARS，相邻块保留 OVERLAP 字重叠，避免语义被拦腰截断。
 */

const MAX_CHARS = 500;
const OVERLAP = 40;

const SENTENCE_SPLIT = /(?<=[。！？；!?;\n])\s*/;

export function splitChunks(text: string, max = MAX_CHARS, overlap = OVERLAP): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (t.length <= max) return [t];

  const chunks: string[] = [];
  let cur = "";
  const parts = t
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  const flush = (withOverlap: string) => {
    if (cur) chunks.push(cur);
    cur = withOverlap;
  };

  for (const part of parts) {
    // 单句超长（罕见）：硬切分
    if (part.length > max) {
      if (cur) flush("");
      let i = 0;
      while (i < part.length) {
        const seg = part.slice(i, i + max);
        chunks.push(seg);
        i += max - overlap;
      }
      continue;
    }
    if (cur && cur.length + part.length > max) {
      // 加上这句超限：先落块，新块从上一块尾部取 overlap 字开始
      flush(cur.slice(-overlap) + part);
    } else {
      cur += part;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.filter((c) => c.trim().length > 0);
}
