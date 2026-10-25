// X (Twitter) weighted character counting, following the public twitter-text v3 rules:
// code points in the "light" ranges weigh 1, everything else weighs 2; every URL counts as 23;
// an emoji (incl. ZWJ sequences) counts as 2. Shared by the Compose preview and the X provider.
export const X_MAX = 280
const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]]
const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|me|ly|gl|eg|sa|ae|news|app|dev|info|tv)(?:\/[^\s]*)?/gi
const PICTO = /\p{Extended_Pictographic}/u
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null

function plainWeight (s) {
  let n = 0
  const parts = seg ? [...seg.segment(s)].map(x => x.segment) : [...s]
  for (const g of parts) {
    if (PICTO.test(g)) { n += 2; continue }
    for (const ch of g) {
      const cp = ch.codePointAt(0)
      n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2
    }
  }
  return n
}

export function xWeightedLength (text = '') {
  let n = 0; let last = 0
  for (const m of String(text).normalize('NFC').matchAll(URL_RE)) {
    n += plainWeight(text.slice(last, m.index)) + 23
    last = m.index + m[0].length
  }
  return n + plainWeight(String(text).slice(last))
}

/** Split long text into a thread. Prefers paragraph, then sentence, then word boundaries. Adds " i/n" numbering. */
export function splitThread (text, max = X_MAX) {
  text = String(text).trim()
  if (xWeightedLength(text) <= max) return [text]
  const budget = max - 6 // room for " 10/12"
  const tokens = text.split(/(\n+)/).flatMap(p => /\n/.test(p) ? [p] : p.split(/(?<=[.!?؟…])\s+/).flatMap((sent, i, arr) => i < arr.length - 1 ? [sent, ' '] : [sent]))
  const out = []; let cur = ''
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = '' }
  for (const tok of tokens) {
    if (xWeightedLength(cur + tok) <= budget) { cur += tok; continue }
    push()
    if (xWeightedLength(tok) <= budget) { cur = tok.replace(/^\s+/, ''); continue }
    for (const w of tok.split(/(\s+)/)) { // a single overlong sentence: go word by word
      if (xWeightedLength(cur + w) <= budget) cur += w
      else { push(); cur = w.trim() }
    }
  }
  push()
  return out.length > 1 ? out.map((t, i) => `${t} ${i + 1}/${out.length}`) : out
}
