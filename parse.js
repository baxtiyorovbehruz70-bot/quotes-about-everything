'use strict';

/* Key used to detect duplicate quotes (ignores case, punctuation and spacing). */
function makeKey(text) {
  return String(text)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/* Turns one line such as:   12. "Quote text." — Author Name (attribution disputed)
   into { t, a, n }. Returns null when the line cannot be understood. */
function parseLine(raw) {
  const line = String(raw).replace(/^\s*\d+\s*[.)\]:-]\s*/, '').trim();
  if (!line) return null;

  const seps = [' — ', ' – ', ' - ', ' -- '];
  let cut = -1;
  let len = 0;
  for (const s of seps) {
    const p = line.lastIndexOf(s);
    if (p > cut) { cut = p; len = s.length; }
  }
  if (cut < 1) return null;

  const text = line
    .slice(0, cut)
    .trim()
    .replace(/^["“”'‘]+|["“”'’]+$/g, '')
    .trim();

  let author = line.slice(cut + len).trim();
  let note = '';
  const m = author.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    author = m[1].trim();
    note = m[2].trim();
    note = note.charAt(0).toUpperCase() + note.slice(1);
  }
  author = author.replace(/\*/g, '').trim();

  if (!text || !author) return null;
  if (text.length > 600 || author.length > 120 || note.length > 200) return null;
  return { t: text, a: author, n: note };
}

module.exports = { parseLine, makeKey };
