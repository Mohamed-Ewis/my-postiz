// "الكل" brand (direction 3 · Grid): a 2×2 grid mark where each category lights its own square pattern,
// plus the lockup  [grid] الكل | <category>. Returns SVG fragments (resvg text + bundled fonts) so posters
// and the video renderer can embed them anywhere. One fixed active square (top-right, 1) whose colour changes per category. Squares: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
import { measure, FONTS } from '../lib/fonts.js'
import { esc } from '../lib/svg.js'

export const BRAND_NAME = 'الكل'
export const BRAND_CATEGORIES = {
  sport: { label: 'رياضة', en: 'Sport', color: '#00C853', squares: [1] },
  economy: { label: 'اقتصاد', en: 'Economy', color: '#FFB300', squares: [1] },
  politics: { label: 'سياسة', en: 'Politics', color: '#2F6BFF', squares: [1] },
  trend: { label: 'ترند', en: 'Trend', color: '#FF2D87', squares: [1] },
  health: { label: 'صحة', en: 'Health', color: '#00BFA5', squares: [1] },
  breaking: { label: 'عاجل', en: 'Breaking', color: '#FF1F1F', squares: [1] },
  // Neutral (quotes / no category): same square in ink or white.
  neutral: { label: '', en: '', color: null, squares: [1] }
}
/** Poster/project categories → brand categories. */
export const CATEGORY_MAP = { sport: 'sport', economy: 'economy', politics: 'politics', 'politics-economy': 'politics', medical: 'health', health: 'health', trend: 'trend', breaking: 'breaking', quote: 'neutral' }
export const brandCategory = c => BRAND_CATEGORIES[c] ? c : CATEGORY_MAP[c] || 'neutral'

const INK = '#0A0A0F'; const PAPER = '#FFFFFF'
const theme = dark => ({ fg: dark ? PAPER : INK, off: dark ? 'rgba(255,255,255,0.18)' : 'rgba(10,10,15,0.12)' })
const n = v => +v.toFixed(2)

/** Grid mark in a size×size box at (x,y). */
export function icon (category, { x = 0, y = 0, size = 100, dark = true, inset = 0 } = {}) {
  const c = BRAND_CATEGORIES[brandCategory(category)]; const t = theme(dark)
  const on = c.color || t.fg
  const S = size - 2 * inset; const g = S * 0.09; const q = (S - g) / 2; const r = q * 0.2
  let s = ''
  for (let i = 0; i < 4; i++) {
    const sx = x + inset + (i % 2) * (q + g); const sy = y + inset + Math.floor(i / 2) * (q + g)
    s += `<rect x="${n(sx)}" y="${n(sy)}" width="${n(q)}" height="${n(q)}" rx="${n(r)}" fill="${c.squares.includes(i) ? on : t.off}"/>`
  }
  return s
}

const WORD = { font: 'tajawal', weight: 800 }; const CAT = { font: 'plex', weight: 500 }
/**
 * Horizontal lockup, RTL: [grid] الكل | رياضة. h = cap height box. Anchored by its RIGHT edge (anchor 'end')
 * or LEFT edge ('start'); y is the TOP. Returns { svg, width, height }.
 */
export function lockup (category, { x = 0, y = 0, height = 60, dark = true, anchor = 'start', showCategory = true, labelColor = null } = {}) {
  const key = brandCategory(category); const c = BRAND_CATEGORIES[key]; const t = theme(dark)
  const h = height; const ws = h * 0.98; const cs = h * 0.5
  const ww = measure(BRAND_NAME, ws, WORD.font, WORD.weight)
  const label = showCategory ? c.label : ''
  const cw = label ? measure(label, cs, CAT.font, CAT.weight) : 0
  const gapI = h * 0.26; const gapD = h * 0.28
  const width = h + gapI + ww + (label ? gapD * 2 + h * 0.035 + cw : 0)
  const left = anchor === 'end' ? x - width : x
  let cx = left + width
  const base = y + h * 0.8
  let s = icon(key, { x: cx - h, y, size: h, dark })
  cx -= h + gapI
  s += `<text x="${n(cx)}" y="${n(base)}" font-family="${FONTS[WORD.font].family}" font-weight="${WORD.weight}" font-size="${n(ws)}" fill="${t.fg}" text-anchor="end" direction="rtl">${BRAND_NAME}</text>`
  cx -= ww
  if (label) {
    cx -= gapD
    s += `<rect x="${n(cx - h * 0.035)}" y="${n(y + h * 0.18)}" width="${n(h * 0.035)}" height="${n(h * 0.66)}" fill="${t.fg}" fill-opacity="0.4"/>`
    cx -= h * 0.035 + gapD
    s += `<text x="${n(cx)}" y="${n(base - h * 0.04)}" font-family="${FONTS[CAT.font].family}" font-weight="${CAT.weight}" font-size="${n(cs)}" fill="${labelColor || c.color || t.fg}" text-anchor="end" direction="rtl">${esc(label)}</text>`
  }
  return { svg: s, width, height: h }
}

/** Corner watermark for photos/video frames: translucent dark chip + small lockup (or icon only). */
export function watermark (category, { x = 0, y = 0, height = 44, anchor = 'end', iconOnly = false, opacity = 0.92 } = {}) {
  const padX = height * 0.32; const padY = height * 0.24
  if (iconOnly) {
    const size = height + 2 * padY; const left = anchor === 'end' ? x - size : x
    return { svg: `<g opacity="${opacity}"><rect x="${n(left)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" rx="${n(size * 0.22)}" fill="#000" fill-opacity="0.4"/>${icon(category, { x: left + padY, y: y + padY, size: height, dark: true })}</g>`, width: size, height: size }
  }
  const l = lockup(category, { x: 0, y: 0, height, dark: true })
  const w = l.width + 2 * padX; const hh = height + 2 * padY; const left = anchor === 'end' ? x - w : x
  return { svg: `<g opacity="${opacity}"><rect x="${n(left)}" y="${n(y)}" width="${n(w)}" height="${n(hh)}" rx="${n(hh * 0.22)}" fill="#000" fill-opacity="0.4"/><g transform="translate(${n(left + padX)},${n(y + padY)})">${l.svg}</g></g>`, width: w, height: hh }
}

/** Standalone SVG documents (for files, the UI, or the video renderer → svgToPng). */
export const iconSvg = (category, { size = 512, dark = true, tile = true } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${dark ? INK : PAPER}"/>` : ''}${icon(category, { size, dark, inset: tile ? size * 0.2 : 0 })}</svg>`
export function lockupSvg (category, { height = 120, dark = true, background = false } = {}) {
  const pad = height * 0.4; const l = lockup(category, { x: pad, y: pad, height, dark })
  const W = Math.ceil(l.width + 2 * pad); const H = Math.ceil(height + 2 * pad)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${background ? `<rect width="${W}" height="${H}" fill="${dark ? INK : PAPER}"/>` : ''}${l.svg}</svg>`
}
