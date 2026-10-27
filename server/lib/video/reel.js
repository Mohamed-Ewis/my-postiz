// "الكل" news reel (9:16): fixed branded intro → animated news items (photo Ken Burns + masked line reveals)
// → fixed outro with CTA. Text/graphics are SVG frames rendered by resvg (bundled fonts, correct Arabic RTL),
// motion is per-frame SVG for the animated parts + ffmpeg (zoompan, xfade, overlays). SFX are original,
// synthesized with ffmpeg (assets/sfx). Other categories only swap colour/label (BRAND_CATEGORIES).
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runFfmpeg, probe } from './ffmpeg.js'
import { svgToPng } from '../../templates/index.js'
import { ensureBed, ensureSting, hasBed } from './music.js'
import { BRAND_CATEGORIES, brandCategory, lockup, watermark, icon } from '../../templates/brand/alkol.js'
import { fitText, esc } from '../../templates/lib/svg.js'
import { FONTS, measure } from '../../templates/lib/fonts.js'
import { synthesize, voiceId, voiceStyle } from './tts.js'

export const REEL_ID = 'news-reel'
export const REEL = { width: 1080, height: 1920, fps: 30, intro: 2.5, outro: 3, transition: 0.5, itemDefault: 7, itemMin: 3, itemMax: 20, maxItems: 20, maxTotal: 180 }
const INK = '#0A0A0F'
const num = (v, d, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) && v !== '' && v !== null ? +v : d))
const bad = m => Object.assign(new Error(m), { statusCode: 400 })
/** Automatic item length without voice-over, from the headline word count (the description is not shown on screen). */
export const autoDuration = title => { const w = String(title || '').trim().split(/\s+/).filter(Boolean).length; return +Math.min(10, Math.max(3.5, 2 + 0.45 * w)).toFixed(1) }

/** Validate a reel spec. allowFiles lets server-side callers (sample script/tests) pass local image paths. */
export function normalizeReelSpec (s = {}, { allowFiles = false } = {}) {
  const items = (Array.isArray(s.items) ? s.items : []).slice(0, REEL.maxItems).map(it => ({
    mediaId: it.mediaId || null,
    file: allowFiles && it.file ? String(it.file) : null,
    title: String(it.title || '').trim().slice(0, 160),
    body: String(it.body || '').trim().slice(0, 220), // spoken only (voice-over); never drawn on the frames
    // Used only without voice-over (with it, the speech length decides): explicit value, else automatic from the headline.
    duration: it.duration !== undefined && it.duration !== null && it.duration !== '' ? num(it.duration, REEL.itemDefault, REEL.itemMin, REEL.itemMax) : autoDuration(it.title),
    stat: it.stat && String(it.stat.value || '').trim() ? { value: String(it.stat.value).trim().slice(0, 12), dir: ['up', 'down'].includes(it.stat.dir) ? it.stat.dir : '', label: String(it.stat.label || '').trim().slice(0, 24) } : null
  })).filter(it => it.title && (it.mediaId || it.file))
  if (!items.length) throw bad('ضيف خبر واحد على الأقل (صورة + عنوان)')
  const spec = {
    template: REEL_ID,
    category: brandCategory(s.category || 'sport'),
    handle: String(s.handle || '@alkol').slice(0, 40),
    cta: String(s.cta || 'تابعونا').slice(0, 40),
    items,
    music: s.music?.mediaId || (allowFiles && s.music?.file) ? { mediaId: s.music.mediaId || null, file: allowFiles ? s.music.file || null : null, volume: num(s.music.volume, 0.25, 0, 1) } : null,
    sfx: s.sfx !== false,
    categoryMusic: s.categoryMusic !== false,
    quality: s.quality === 'draft' ? 'draft' : 'hd',
    afterRender: s.afterRender === 'queue' ? 'queue' : 'draft',
    // Arabic TTS voice-over (default on; the voice itself is fixed server-side, any requested name is ignored). The intro is never spoken.
    voice: { enabled: s.voice?.enabled ?? s.voiceOver ?? true, name: voiceId() }
  }
  spec.voice.enabled = spec.voice.enabled !== false && spec.voice.enabled !== 'false'
  if (spec.category === 'neutral') spec.category = 'sport'
  const tl = reelTimeline(spec)
  if (tl.total > REEL.maxTotal) throw bad(`الريل أطول من ${REEL.maxTotal / 60} دقايق (${Math.round(tl.total)}s) — قلّل الأخبار أو مددها`)
  return spec
}

/** Segment timing, transitions, HUD windows and SFX cues (seconds). */
export function reelTimeline (spec) {
  const T = REEL.transition
  const segs = [{ kind: 'intro', duration: spec.introDuration || REEL.intro }, ...spec.items.map((it, i) => ({ kind: 'item', index: i, duration: it.duration })), { kind: 'outro', duration: REEL.outro }]
  let t = 0
  segs.forEach((s, i) => { s.start = i ? t : 0; t = s.start + s.duration - T })
  const total = +(segs.at(-1).start + segs.at(-1).duration).toFixed(3)
  const transitions = segs.slice(1).map((s, i) => ({ offset: s.start, type: s.kind === 'item' && i > 0 ? 'smoothright' : 'fade', duration: T }))
  const items = segs.filter(s => s.kind === 'item')
  const hud = items.map((s, k) => ({ index: k, from: k === 0 ? s.start : s.start + T / 2, to: k === items.length - 1 ? s.start + s.duration : s.start + s.duration - T / 2, fillFrom: s.start + (k ? T / 2 : T), fillDur: s.duration - (k ? T : 1.5 * T) }))
  const sfx = [
    { t: 0.42, name: 'pop', gain: 0.9 }, { t: 1.05, name: 'hit', gain: 1 },
    { t: segs.at(-1).start + 0.35, name: 'hit', gain: 0.9 }, { t: segs.at(-1).start + 0.8, name: 'chime', gain: 0.6 }
  ].map(x => ({ ...x, t: +x.t.toFixed(3) }))
  return { segments: segs, transitions, hud, sfx, total }
}

// ---------- easing / helpers ----------
const clamp01 = v => Math.max(0, Math.min(1, v))
const prog = (t, a, d) => clamp01((t - a) / d)
const eOut = p => 1 - Math.pow(1 - p, 3)
const eBack = (p, k = 1.9) => 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2)
const n = v => +(+v).toFixed(2)
const rtlText = v => `\u200F${esc(v)}\u200F` // RLM: keeps leading/trailing digits & Latin on the correct side
const fam = k => FONTS[k].family
const lum = hex => { const v = parseInt(hex.slice(1), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255 }
const cat = c => ({ key: brandCategory(c), ...BRAND_CATEGORIES[brandCategory(c)] })
const doc = (W, H, body, bg = null) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}${body}</svg>`
function backdrop (W, H, color) {
  return `<defs><radialGradient id="glow" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="${color}" stop-opacity="0.16"/><stop offset="0.6" stop-color="${color}" stop-opacity="0.03"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="${INK}"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`
}

/** Animated grid mark: squares pop in one by one, the active (top-right) square last with overshoot. */
function animatedIcon (category, { cx, cy, size, t, t0 = 0 }) {
  const c = cat(category); const S = size; const g = S * 0.09; const q = (S - g) / 2; const r = q * 0.2
  let s = ''
  const order = [3, 0, 2, 1]
  order.forEach((i, k) => {
    const active = c.squares.includes(i)
    const p = prog(t, t0 + (active ? 0.42 : k * 0.09), active ? 0.38 : 0.3)
    if (p <= 0) return
    const sc = Math.max(0, active ? eBack(p, 2.6) : eBack(p, 1.4))
    const x = cx - S / 2 + (i % 2) * (q + g) + q / 2; const y = cy - S / 2 + Math.floor(i / 2) * (q + g) + q / 2
    const w = q * sc
    s += `<rect x="${n(x - w / 2)}" y="${n(y - w / 2)}" width="${n(w)}" height="${n(w)}" rx="${n(r * sc)}" fill="${active ? c.color : 'rgba(255,255,255,0.18)'}"/>`
    if (active && p < 1) s += `<rect x="${n(x - q * (0.5 + p * 0.7))}" y="${n(y - q * (0.5 + p * 0.7))}" width="${n(q * (1 + p * 1.4))}" height="${n(q * (1 + p * 1.4))}" rx="${n(r * 2)}" fill="none" stroke="${c.color}" stroke-width="${n(q * 0.06)}" stroke-opacity="${n(1 - p)}"/>`
  })
  return s
}

/** Lockup that builds itself: the mark (big → final position) then the wordmark/category wipe in. */
function lockupBuild (category, { W, cy, h, t, t0 = 0 }) {
  const l = lockup(category, { x: 0, y: 0, height: h, dark: true })
  const left = (W - l.width) / 2; const top = cy - h / 2
  const icx = left + l.width - h / 2
  const m = eOut(prog(t, t0 + 0.72, 0.5))
  const size = h * (2.3 - 1.3 * m); const x = W / 2 + (icx - W / 2) * m
  const wipe = eOut(prog(t, t0 + 1.0, 0.55))
  const textW = l.width - h
  // Text part (everything left of the icon) revealed right→left by a clip, sliding in slightly.
  const clipX = left + textW * (1 - wipe)
  const text = l.svg.replace(/^(<rect[^>]*\/>){4}/, '')
  let s = `<defs><clipPath id="lw"><rect x="${n(clipX - h * 0.1)}" y="${n(top - h)}" width="${n(textW * wipe + h * 0.1)}" height="${n(h * 3)}"/></clipPath></defs>`
  if (wipe > 0) s += `<g clip-path="url(#lw)" opacity="${n(wipe)}"><g transform="translate(${n(left + (1 - wipe) * h * 0.6)},${n(top)})">${text}</g></g>`
  s += animatedIcon(category, { cx: x, cy, size, t, t0 })
  return { svg: s, width: l.width, left, top }
}

export function introSvg (category, t, { W = 1080, H = 1920 } = {}) {
  const c = cat(category); const s = W / 1080
  const b = lockupBuild(category, { W, cy: H * 0.47, h: 120 * s, t })
  const ul = eOut(prog(t, 1.35, 0.5))
  const line = ul > 0 ? `<rect x="${n(W / 2 - 160 * s * ul)}" y="${n(H * 0.47 + 120 * s)}" width="${n(320 * s * ul)}" height="${n(5 * s)}" rx="${n(2.5 * s)}" fill="${c.color}" opacity="${n(ul)}"/>` : ''
  return doc(W, H, backdrop(W, H, c.color) + b.svg + line) // logo only: no subtitle/banner, no voice
}

export function outroSvg (category, t, { W = 1080, H = 1920, handle = '@alkol', cta = 'تابعونا' } = {}) {
  const c = cat(category); const s = W / 1080
  const h = 104 * s; const cy = H * 0.4
  const b = lockupBuild(category, { W, cy, h, t: t + 0.72 }) // start from the "mark settled" phase: faster
  const p1 = eOut(prog(t, 0.45, 0.5)); const p2 = eOut(prog(t, 0.7, 0.5))
  const cy2 = cy + 210 * s
  let x = ''
  if (p1 > 0) x += `<text x="${W / 2}" y="${n(cy2 + (1 - p1) * 40 * s)}" font-family="${fam('tajawal')}" font-weight="800" font-size="${n(96 * s)}" fill="#fff" fill-opacity="${n(p1)}" text-anchor="middle" direction="rtl">${rtlText(cta)}</text>`
  if (p2 > 0) {
    const fs = 46 * s; const tw = measure(handle, fs, 'plex', 500) + 64 * s; const ph = 84 * s; const py = cy2 + 60 * s + (1 - p2) * 30 * s
    x += `<g opacity="${n(p2)}"><rect x="${n(W / 2 - tw / 2)}" y="${n(py)}" width="${n(tw)}" height="${n(ph)}" rx="${n(ph / 2)}" fill="${c.color}"/><text x="${W / 2}" y="${n(py + ph * 0.66)}" font-family="${fam('plex')}" font-weight="500" font-size="${n(fs)}" fill="${lum(c.color) > 0.6 ? INK : '#fff'}" text-anchor="middle">${esc(handle)}</text></g>`
  }
  return doc(W, H, backdrop(W, H, c.color) + b.svg + x)
}

/** Per-category video personality (layout, motion, Ken Burns). Same brand system everywhere. */
export const REEL_STYLES = {
  sport: { head: 88, minHead: 60, anim: 'mask', speed: 1, panel: null, kb: 0.12 },
  economy: { head: 84, minHead: 58, anim: 'mask', speed: 1, panel: null, kb: 0.07, stat: true },
  politics: { head: 78, minHead: 56, anim: 'fade', speed: 0.7, panel: 'lower', kb: 0.05 },
  trend: { head: 98, minHead: 64, anim: 'pop', speed: 1.45, panel: null, kb: 0.16 },
  health: { head: 78, minHead: 56, anim: 'rise', speed: 0.85, panel: 'card', kb: 0.07 },
  breaking: { head: 88, minHead: 60, anim: 'mask', speed: 1, panel: null, kb: 0.06, banner: true }
}
export const reelStyle = c => REEL_STYLES[brandCategory(c)] || REEL_STYLES.sport
const STAT_UP = '#00C853'; const STAT_DOWN = '#FF3B30'

/** Text layout for a news item (bottom-anchored inside the platform-safe area). */
export function itemLayout (item, { W = 1080, H = 1920, category = 'sport' } = {}) {
  const st = reelStyle(category)
  const s = W / 1080; const card = st.panel === 'card'
  const M = (card ? 56 : 72) * s; const pad = card ? 44 * s : 0
  const width = W - 2 * M - 2 * pad
  const bottom = H - 430 * s
  const body = null // the description is spoken by the voice-over only; the frame shows just the headline
  const head = fitText({ text: item.title, width, size: st.head * s, minSize: st.minHead * s, maxLines: 4, font: 'tajawal', weight: 800, lh: 1.22 })
  const bodyTop = bottom
  const headTop = bottom - head.height
  const hasStat = !!(st.stat && item.stat?.value)
  const statH = hasStat ? 140 * s : 0
  const statTop = headTop - (hasStat ? 26 * s : 0) - statH
  const tagH = (st.banner ? 96 : 58) * s; const tagTop = statTop - (st.banner ? 36 : 30) * s - tagH
  const right = W - M - pad
  return { s, M, pad, width, right, head, headTop, body, bodyTop, tagTop, tagH, statTop, statH, hasStat, bottom, style: st }
}

/** Item overlay at time t: gradients/panel + category tag (or عاجل banner) + optional stat + headline (the description is never drawn). */
export function itemSvg (category, item, t, { W = 1080, H = 1920 } = {}) {
  const c = cat(category); const L = itemLayout(item, { W, H, category }); const { s, right, style: st } = L
  t *= st.speed
  const card = st.panel === 'card'; const ink = card ? INK : '#fff'
  const gbMax = card ? 0.45 : 0.92
  let o = `<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.45" stop-color="#000" stop-opacity="${n(gbMax * 0.6)}"/><stop offset="1" stop-color="#000" stop-opacity="${gbMax}"/></linearGradient>` +
    `<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`
  const tp = eOut(prog(t, 0.25, 0.35))
  const tfs = (st.banner ? 60 : 32) * s; const tfam = st.banner ? 'tajawal' : 'plex'; const tweight = st.banner ? 800 : 500
  const tw = st.banner ? L.width : measure(c.label, tfs, tfam, tweight) + 44 * s
  o += `<clipPath id="ct"><rect x="${n(right - tw * tp)}" y="${n(L.tagTop)}" width="${n(tw * tp)}" height="${n(L.tagH)}"/></clipPath>`
  const lines = L.head.lines; const fs = L.head.size; const lh = fs * L.head.lh
  lines.forEach((_, i) => { o += `<clipPath id="cl${i}"><rect x="0" y="${n(L.headTop + i * lh - fs * 0.25)}" width="${W}" height="${n(lh + fs * 0.25)}"/></clipPath>` })
  o += '</defs>'
  o += `<rect y="${n(L.tagTop - 260 * s)}" width="${W}" height="${n(H - L.tagTop + 260 * s)}" fill="url(#gb)"/><rect width="${W}" height="${n(340 * s)}" fill="url(#gt)"/>`
  if (st.panel === 'lower') { // full-width lower-third panel with a category edge bar (wipes in from the right)
    const pp = eOut(prog(t, 0, 0.6)); const top = L.tagTop - 48 * s
    o += `<rect x="${n(W * (1 - pp))}" y="${n(top)}" width="${n(W * pp)}" height="${n(H - top)}" fill="#0A0D12" fill-opacity="0.86"/>`
    o += `<rect x="${n(W - 14 * s)}" y="${n(top)}" width="${n(14 * s)}" height="${n((H - top) * pp)}" fill="${c.color}"/>`
    o += `<rect x="${n(W * (1 - pp))}" y="${n(top)}" width="${n(W * pp)}" height="${n(2 * s)}" fill="#fff" fill-opacity="0.18"/>`
  }
  if (card) { // airy rounded card
    const cp = eOut(prog(t, 0, 0.6)); const top = L.tagTop - 40 * s; const bot = L.bottom + 44 * s
    o += `<g opacity="${n(cp)}" transform="translate(0,${n((1 - cp) * 40 * s)})"><rect x="${n(L.M)}" y="${n(top)}" width="${n(W - 2 * L.M)}" height="${n(bot - top)}" rx="${n(40 * s)}" fill="#fff" fill-opacity="0.94"/>` +
      `<rect x="${n(L.M + 40 * s)}" y="${n(bot - 10 * s)}" width="${n(W - 2 * L.M - 80 * s)}" height="${n(5 * s)}" rx="${n(2.5 * s)}" fill="${c.color}" fill-opacity="0.85"/></g>`
  }
  if (tp > 0) {
    const fg = lum(c.color) > 0.6 ? INK : '#fff'
    o += `<g clip-path="url(#ct)"><rect x="${n(right - tw)}" y="${n(L.tagTop)}" width="${n(tw)}" height="${n(L.tagH)}" rx="${n((st.banner ? 10 : card ? 29 : 8) * s)}" fill="${c.color}"/>`
    o += `<text x="${n(right - (st.banner ? 34 : 22) * s)}" y="${n(L.tagTop + L.tagH * (st.banner ? 0.7 : 0.68))}" font-family="${fam(tfam)}" font-weight="${tweight}" font-size="${n(tfs)}" fill="${fg}" text-anchor="end" direction="rtl">${esc(c.label)}</text>`
    if (st.banner) {
      const lw = measure(c.label, tfs, tfam, tweight); const dx = right - 34 * s - lw - 40 * s; const cy = L.tagTop + L.tagH / 2
      o += `<circle cx="${n(dx)}" cy="${n(cy)}" r="${n(14 * s)}" fill="#fff"/><circle cx="${n(dx)}" cy="${n(cy)}" r="${n(24 * s)}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="${n(3 * s)}"/>`
      for (let k = 0; k < 6; k++) o += `<rect x="${n(right - tw + (24 + k * 34) * s)}" y="${n(L.tagTop)}" width="${n(14 * s)}" height="${n(L.tagH)}" fill="#000" fill-opacity="0.12" transform="skewX(-20)" transform-origin="${n(right - tw + (31 + k * 34) * s)} ${n(cy)}"/>`
    }
    o += '</g>'
  }
  if (L.hasStat) { // economy: big figure + arrow (+ optional label)
    const sp = eOut(prog(t, 0.35, 0.45)); const dir = item.stat.dir
    const col = dir === 'up' ? STAT_UP : dir === 'down' ? STAT_DOWN : '#fff'
    const vfs = 118 * s; const val = String(item.stat.value); const vw = measure(val, vfs, 'tajawal', 800)
    const base = L.statTop + L.statH * 0.82; const dy = (1 - sp) * 30 * s
    o += `<g opacity="${n(sp)}" transform="translate(0,${n(dy)})"><text x="${n(right)}" y="${n(base)}" font-family="${fam('tajawal')}" font-weight="800" font-size="${n(vfs)}" fill="${col}" text-anchor="end" direction="ltr">${esc(val)}</text>`
    let ax = right - vw - 62 * s
    if (dir === 'up' || dir === 'down') {
      const a = 34 * s; const cy = base - vfs * 0.36
      o += dir === 'up' ? `<path d="M${n(ax)} ${n(cy - a)} L${n(ax + a)} ${n(cy + a * 0.7)} L${n(ax - a)} ${n(cy + a * 0.7)} Z" fill="${col}"/>` : `<path d="M${n(ax)} ${n(cy + a)} L${n(ax + a)} ${n(cy - a * 0.7)} L${n(ax - a)} ${n(cy - a * 0.7)} Z" fill="${col}"/>`
      ax -= a + 26 * s
    }
    if (item.stat.label) o += `<text x="${n(ax)}" y="${n(base - vfs * 0.24)}" font-family="${fam('plex')}" font-weight="500" font-size="${n(38 * s)}" fill="#fff" fill-opacity="0.8" text-anchor="end" direction="rtl">${rtlText(item.stat.label)}</text>`
    o += `<rect x="${n(right - L.width)}" y="${n(L.statTop + L.statH + 10 * s)}" width="${n(L.width * sp)}" height="${n(2 * s)}" fill="#fff" fill-opacity="0.25"/></g>`
  }
  const t0 = L.hasStat ? 0.65 : 0.45
  const stagger = st.anim === 'pop' ? 0.09 : st.anim === 'fade' ? 0.2 : 0.13
  lines.forEach((line, i) => {
    const a = t0 + i * stagger
    const base = L.headTop + i * lh + fs * 0.92
    const txt = y => `<text x="${n(right)}" y="${n(y)}" font-family="${fam('tajawal')}" font-weight="800" font-size="${n(fs)}" fill="${ink}" text-anchor="end" direction="rtl">${rtlText(line)}</text>`
    if (st.anim === 'mask') { const p = eOut(prog(t, a, 0.55)); if (p > 0) o += `<g clip-path="url(#cl${i})">${txt(base + (1 - p) * lh)}</g>` } else if (st.anim === 'pop') {
      const p = prog(t, a, 0.4); if (p <= 0) return
      const sc = Math.max(0.01, eBack(p, 2.2)); const cy = base - fs * 0.35
      o += `<g opacity="${n(Math.min(1, p * 3))}" transform="translate(${n(right)},${n(cy)}) scale(${n(sc)}) translate(${n(-right)},${n(-cy)})">${txt(base)}</g>`
    } else { const p = eOut(prog(t, a, st.anim === 'fade' ? 0.7 : 0.55)); if (p > 0) o += `<g opacity="${n(p)}">${txt(base + (1 - p) * (st.anim === 'fade' ? 18 : 34) * s)}</g>` }
  })
  return doc(W, H, o)
}
export const itemAnimEnd = (item, category = 'sport') => (0.65 + 0.2 * 4 + 0.3 + 0.75) / reelStyle(category).speed

/** (Unused by the renderer since progress bars were removed; kept for API compatibility.) */
export function hudGeometry (count, { W = 1080 } = {}) {
  const s = W / 1080; const M = 48 * s; const gap = 10 * s; const y = 92 * s; const h = 7 * s
  const sw = (W - 2 * M - gap * (count - 1)) / count
  return { y, h, segs: Array.from({ length: count }, (_, i) => ({ x: Math.round(W - M - (i + 1) * sw - i * gap), w: Math.round(sw) })) }
}
/** Static HUD for item k: top-right "الكل | category" watermark, counter. */
export function hudSvg (category, k, count, { W = 1080, H = 1920 } = {}) {
  const s = W / 1080
  let o = ''
  const wm = watermark(category, { x: W - 48 * s, y: 128 * s, height: 50 * s, anchor: 'end', opacity: 1 })
  o += wm.svg
  const ct = `${k + 1} / ${count}`; const fs = 32 * s; const cw = measure(ct, fs, 'plex', 500) + 36 * s; const chh = wm.height
  o += `<rect x="${n(48 * s)}" y="${n(128 * s)}" width="${n(cw)}" height="${n(chh)}" rx="${n(chh * 0.22)}" fill="#000" fill-opacity="0.4"/><text x="${n(48 * s + cw / 2)}" y="${n(128 * s + chh * 0.64)}" font-family="${fam('plex')}" font-weight="500" font-size="${n(fs)}" fill="#fff" text-anchor="middle" direction="ltr">${ct}</text>`
  return doc(W, H, o)
}

// ---------- SFX (original, synthesized) ----------
export const SFX_DIR = () => resolve(process.cwd(), 'assets/sfx')
export const SFX = {
  whoosh: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.7:c=pink:a=0.9:r=48000', '-af', "highpass=f=350,lowpass=f=5200,bandpass=f=1500:width_type=o:w=2.2,afade=t=in:d=0.42:curve=exp,afade=t=out:st=0.42:d=0.28:curve=tri,apulsator=hz=1.6:amount=0.25,volume=2.2"],
  hit: ['-f', 'lavfi', '-i', "aevalsrc='0.95*sin(2*PI*(46+110*exp(-t*28))*t)*exp(-t*5.5)+0.25*(random(0)-0.5)*exp(-t*60)':d=0.9:s=48000"],
  pop: ['-f', 'lavfi', '-i', "aevalsrc='0.7*sin(2*PI*(520+700*exp(-t*35))*t)*exp(-t*18)':d=0.3:s=48000"],
  tick: ['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*1900*t)*exp(-t*70)+0.3*sin(2*PI*950*t)*exp(-t*45)':d=0.12:s=48000"],
  chime: ['-f', 'lavfi', '-i', "aevalsrc='0.32*sin(2*PI*784*t)*exp(-t*2.6)+0.24*sin(2*PI*1175*t)*exp(-t*3.2)+0.16*sin(2*PI*1568*t)*exp(-t*4)':d=1.6:s=48000"]
}
export async function ensureSfx ({ force = false } = {}) {
  const dir = SFX_DIR(); await mkdir(dir, { recursive: true })
  const out = {}
  for (const [name, args] of Object.entries(SFX)) {
    const f = join(dir, `${name}.wav`); out[name] = f
    if (force || !existsSync(f)) await runFfmpeg([...args, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', f])
  }
  return out
}

/** Gain for the generated bed (file ≈ -18.5 LUFS) → ≈ -22 LUFS in the final mix. */
export const BED_VOLUME = 0.48
const STING_AT = 1.3; const STING_GAIN = 1.3
export { hasBed }

// ---------- render ----------
const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-an']
async function frames (dir, dur, fn, W) {
  await mkdir(dir, { recursive: true })
  const count = Math.max(1, Math.round(dur * REEL.fps))
  for (let f = 0; f < count; f++) await writeFile(join(dir, `f_${String(f).padStart(4, '0')}.png`), svgToPng(fn(f / REEL.fps), W))
  return count
}
/** Card clip (intro/outro): animated frames for animDur, last frame held to dur. */
async function cardClip (dir, out, dur, animDur, fn, W) {
  const c = await frames(dir, animDur, fn, W)
  await runFfmpeg(['-framerate', String(REEL.fps), '-i', join(dir, 'f_%04d.png'), '-vf', `tpad=stop_mode=clone:stop_duration=${(dur - c / REEL.fps + 0.1).toFixed(3)},format=yuv420p`, '-t', String(dur), '-r', String(REEL.fps), ...enc, out])
}
function kenBurns (k, W, H, frames, amp = 0.12) {
  const z = k % 2 ? `${n(1.02 + amp)}-${amp}*on/${frames}` : `1.02+${amp}*on/${frames}`
  const x = k % 3 === 2 ? `(iw-iw/zoom)*(0.35+0.3*on/${frames})` : k % 3 === 1 ? `(iw-iw/zoom)*(0.65-0.3*on/${frames})` : 'iw/2-(iw/zoom/2)'
  return `zoompan=z='${z}':x='${x}':y='(ih-ih/zoom)*0.42':d=1:s=${W}x${H}:fps=${REEL.fps}`
}

// ---------- voice-over ----------
export const VOICE = { lead: 0.6, tail: 0.5, gain: 1.0 } // tail ≈ the transition length: next item starts right after the speech ends
/**
 * Synthesize the voice-over (headline + description per item; the intro is NOT spoken) and time every item exactly to its
 * speech: item.duration = lead + speech + tail (no fixed minimum). If that breaks the 3-minute cap, descriptions are dropped
 * from the speech; if still too long → error. Returns { spec (copy with new durations), intro: null, items: [{file,duration}] }.
 */
export async function prepareVoice (spec, { synth = synthesize } = {}) {
  const v = spec.voice.name
  const style = voiceStyle(spec.category) // Gemini delivery per category (ignored by Edge)
  const build = async withBody => {
    const items = []
    for (const it of spec.items) items.push(await synth(withBody && it.body ? [it.title, it.body] : [it.title], v, { style }))
    const out = { ...spec, items: spec.items.map((it, i) => ({ ...it, duration: +(VOICE.lead + items[i].duration + VOICE.tail).toFixed(2) })) }
    const fellBack = items.find(x => x?.provider === 'edge')
    return { spec: out, intro: null, items, bodies: withBody, fellBack: fellBack ? fellBack.fallbackReason || 'Gemini' : '' }
  }
  let r = await build(true)
  if (reelTimeline(r.spec).total > REEL.maxTotal && spec.items.some(it => it.body)) r = await build(false)
  const total = reelTimeline(r.spec).total
  if (total > REEL.maxTotal) throw bad(`مع التعليق الصوتي الريل هيبقى ${Math.round(total)} ثانية (أكتر من ٣ دقايق) — قلّل الأخبار أو اختصر العناوين`)
  return r
}

/**
 * Render a reel. resolveFile(item|music) → absolute path. Returns { file, duration, timeline }.
 */
export async function renderReel (spec, opts) {
  const { tmp, outFile, resolveFile = x => x.file, update = async () => {} } = opts
  const draft = spec.quality === 'draft'
  const W = draft ? 720 : REEL.width; const H = draft ? 1280 : REEL.height
  let voice = null; let voiceNote = ''
  if (spec.voice?.enabled) {
    await update({ stage: 'Voice-over', progress: 2 })
    try { voice = await prepareVoice(spec, { synth: opts.synth }); spec = voice.spec } catch (e) {
      if (e.statusCode === 400) throw e
      voiceNote = `التعليق الصوتي ما اشتغلش (${String(e.message || e).slice(0, 120)}) — الفيديو اتعمل بالموسيقى بس`
      console.warn('[reel] voice-over failed:', e.message)
    }
    if (voice?.fellBack) voiceNote = `صوت Gemini مش متاح دلوقتي (${String(voice.fellBack).slice(0, 90)}) — اتستخدم صوت Edge بدله`
    if (voice && !voice.bodies && spec.items.some(it => it.body)) voiceNote = 'التعليق الصوتي قرا العناوين بس عشان الريل ما يعديش ٣ دقايق'
  }
  const tl = reelTimeline(spec); const cat0 = spec.category
  await mkdir(tmp, { recursive: true })
  const sfx = spec.sfx ? await ensureSfx() : null
  const clips = []
  const nSeg = tl.segments.length
  for (const [i, sg] of tl.segments.entries()) {
    await update({ stage: `Scene ${i + 1}/${nSeg}`, progress: 3 + Math.round(70 * i / nSeg) })
    const out = join(tmp, `seg_${i}.mp4`); const dir = join(tmp, `fr_${i}`)
    if (sg.kind === 'intro') await cardClip(dir, out, sg.duration, 2.1, t => introSvg(cat0, t, { W, H }), W)
    else if (sg.kind === 'outro') await cardClip(dir, out, sg.duration, 1.4, t => outroSvg(cat0, t, { W, H, handle: spec.handle, cta: spec.cta }), W)
    else {
      const it = spec.items[sg.index]
      const src = await resolveFile(it)
      const still = join(tmp, `still_${i}.png`)
      await runFfmpeg(['-i', src, '-frames:v', '1', '-vf', `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},setsar=1`, still])
      const c = await frames(dir, Math.min(sg.duration, itemAnimEnd(it, cat0)), t => itemSvg(cat0, it, t, { W, H }), W)
      const nf = Math.round(sg.duration * REEL.fps)
      await runFfmpeg(['-loop', '1', '-framerate', String(REEL.fps), '-t', String(sg.duration), '-i', still, '-framerate', String(REEL.fps), '-i', join(dir, 'f_%04d.png'),
        '-filter_complex', `[0:v]${kenBurns(sg.index, W, H, nf, reelStyle(cat0).kb)},format=yuv420p[bg];[1:v]tpad=stop_mode=clone:stop_duration=${(sg.duration - c / REEL.fps + 0.1).toFixed(3)},format=rgba[ov];[bg][ov]overlay=0:0:shortest=1,format=yuv420p[v]`,
        '-map', '[v]', '-t', String(sg.duration), '-r', String(REEL.fps), ...enc, out])
    }
    await rm(dir, { recursive: true, force: true })
    clips.push(out)
  }

  // Final: xfade chain → HUD overlays (per item) → progress fills; audio = SFX bus (+ ducked music).
  await update({ stage: 'Final mix', progress: 75 })
  const args = []; const fl = []
  clips.forEach(c => args.push('-i', c))
  let idx = clips.length; let last = '[0:v]'
  tl.transitions.forEach((x, i) => { fl.push(`${last}[${i + 1}:v]xfade=transition=${x.type}:duration=${x.duration}:offset=${x.offset.toFixed(3)}[x${i}]`); last = `[x${i}]` })
  for (const hd of tl.hud) {
    const png = join(tmp, `hud_${hd.index}.png`)
    await writeFile(png, svgToPng(hudSvg(cat0, hd.index, spec.items.length, { W, H }), W))
    args.push('-loop', '1', '-framerate', String(REEL.fps), '-t', tl.total.toFixed(3), '-i', png)
    const first = hd.index === 0; const lastItem = hd.index === spec.items.length - 1
    let hchain = `[${idx}:v]format=rgba`
    if (first) hchain += `,fade=t=in:st=${hd.from.toFixed(3)}:d=${REEL.transition}:alpha=1`
    if (lastItem) hchain += `,fade=t=out:st=${(hd.to - REEL.transition).toFixed(3)}:d=${REEL.transition}:alpha=1`
    fl.push(`${hchain}[h${hd.index}]`, `${last}[h${hd.index}]overlay=0:0:enable='between(t,${hd.from.toFixed(3)},${hd.to.toFixed(3)})'[hv${hd.index}]`)
    last = `[hv${hd.index}]`; idx++
  }
  fl.push(`${last}format=yuv420p[vout]`)
  const sfxLabels = []
  if (sfx) {
    for (const [k, e] of tl.sfx.entries()) {
      args.push('-i', sfx[e.name]); const ms = Math.round(e.t * 1000)
      fl.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${e.gain},adelay=${ms}|${ms}[s${k}]`); sfxLabels.push(`[s${k}]`); idx++
    }
  }
  args.push('-f', 'lavfi', '-t', tl.total.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'); sfxLabels.push(`[${idx}:a]`); idx++
  fl.push(`${sfxLabels.join('')}amix=inputs=${sfxLabels.length}:duration=longest:normalize=0,atrim=0:${tl.total.toFixed(3)}[sfxbus]`)
  // Voice bus: one clip per item (none over the intro), each placed after its text has appeared.
  const cues = voice ? voiceCues(voice, tl) : []
  if (cues.length) {
    const vl = []
    for (const [k, c] of cues.entries()) {
      args.push('-i', c.file); const ms = Math.round(c.t * 1000)
      fl.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${VOICE.gain},adelay=${ms}|${ms}[v${k}]`); vl.push(`[v${k}]`); idx++
    }
    args.push('-f', 'lavfi', '-t', tl.total.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'); vl.push(`[${idx}:a]`); idx++
    fl.push(`${vl.join('')}amix=inputs=${vl.length}:duration=longest:normalize=0,atrim=0:${tl.total.toFixed(3)}[vobus]`)
  }
  const master = 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000'
  // User music overrides; otherwise the category bed (looped seamlessly, mixed low).
  const bed = !spec.music && spec.categoryMusic ? await ensureBed(cat0) : null
  const mus = spec.music ? { file: await resolveFile(spec.music), volume: spec.music.volume } : bed ? { file: bed, volume: BED_VOLUME } : null
  if (mus) {
    args.push('-stream_loop', '-1', '-i', mus.file)
    // Category sting (e.g. breaking news alert): played once over the intro, part of the music layer.
    const sting = bed ? await ensureSting(cat0) : null
    let musIn = `[${idx}:a]`
    if (sting) {
      args.push('-i', sting); idx++
      fl.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${STING_GAIN},adelay=${STING_AT * 1000}|${STING_AT * 1000}[stg]`,
        `[${idx - 1}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${tl.total.toFixed(3)}[bedraw]`,
        `[bedraw][stg]amix=inputs=2:duration=first:normalize=0[bedst]`)
      musIn = '[bedst]'
    }
    fl.push(`${musIn}aresample=48000,aformat=channel_layouts=stereo,volume=${mus.volume.toFixed(3)},atrim=0:${tl.total.toFixed(3)},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, tl.total - 2.5).toFixed(3)}:d=2.5[mus]`)
    if (cues.length) { // music ducks ≈ -12 dB under the voice (and under the intro/outro hits)
      fl.push('[sfxbus]asplit=2[sfxa][sfxk0]', '[vobus]asplit=2[voa][vok0]', '[sfxk0][vok0]amix=inputs=2:normalize=0[key]',
        '[mus][key]sidechaincompress=threshold=0.015:ratio=10:attack=25:release=450:makeup=1[duck]',
        `[sfxa][duck][voa]amix=inputs=3:duration=first:normalize=0,${master},alimiter=limit=0.89:level=false[aout]`)
    } else {
      fl.push('[sfxbus]asplit=2[sfxa][sfxk]', '[mus][sfxk]sidechaincompress=threshold=0.03:ratio=8:attack=8:release=350[duck]',
        `[sfxa][duck]amix=inputs=2:duration=first:normalize=0,${master},alimiter=limit=0.89:level=false[aout]`)
    }
    idx++
  } else if (cues.length) fl.push(`[sfxbus][vobus]amix=inputs=2:duration=first:normalize=0,${master},alimiter=limit=0.89:level=false[aout]`)
  else fl.push(`[sfxbus]${master},alimiter=limit=0.89:level=false[aout]`)
  await runFfmpeg([...args, '-filter_complex', fl.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', tl.total.toFixed(3),
    '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', '20', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', String(REEL.fps),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', outFile],
  { onProgress: t => update({ progress: Math.min(97, 75 + Math.round(22 * t / tl.total)) }) })
  const info = await probe(outFile)
  return { file: outFile, duration: info.duration, timeline: tl, info, voiceNote, voice: voice ? spec.voice.name : null }
}

/** Where each voice clip starts (seconds) on the reel timeline. */
export function voiceCues (voice, tl) {
  const out = []
  tl.segments.filter(sg => sg.kind === 'item').forEach((sg, k) => { const v = voice.items[k]; if (v) out.push({ t: +(sg.start + VOICE.lead).toFixed(3), file: v.file, duration: v.duration }) })
  return out
}
