// Layout modules. Each returns an SVG string for ctx:
// { W, H, rtl, font, accent, label, headline, subtitle, source, date, image, focus, stat, brand, ink, paper }
import { measure, FONTS } from './lib/fonts.js'
import { fitText, textSvg, chip, photo, linearScrim, footer, mix, esc } from './lib/svg.js'
import { lockup as brandLockup } from './brand/alkol.js'

const pad = ctx => Math.round(Math.min(ctx.W, ctx.H) * 0.075)
const scaleFor = ctx => Math.min(ctx.W, ctx.H) / 1080
const fsTitle = ctx => Math.round((ctx.H > ctx.W * 1.5 ? 96 : ctx.W > ctx.H ? 84 : 88) * scaleFor(ctx))
const chipOf = (ctx, x, y, extra = {}) => chip({ label: ctx.label, x: ctx.rtl ? x + (ctx.W - 2 * pad(ctx)) : x, y, rtl: ctx.rtl, bg: ctx.accent, size: Math.round(24 * scaleFor(ctx)), font: ctx.font, ...extra })

/** "الكل | category" lockup at the top reading-start corner (top-right in RTL). overPhoto adds a soft shadow + scrim. Returns { svg, bottom }. */
export function brandTop (ctx, { dark = true, overPhoto = false, x0 = 0, w = ctx.W } = {}) {
  const P = pad(ctx); const s = scaleFor(ctx)
  if (!ctx.brand?.mark) return { svg: '', bottom: P }
  const h = Math.round(62 * s)
  const l = brandLockup(ctx.brand.mark.category, { x: ctx.rtl ? x0 + w - P : x0 + P, y: P, height: h, dark, anchor: ctx.rtl ? 'end' : 'start', labelColor: overPhoto ? '#FFFFFF' : null })
  let svg = l.svg
  if (overPhoto) {
    // Translucent dark pill behind the lockup keeps it legible on any photo.
    const px = h * 0.34; const py = h * 0.22
    const rx = ctx.rtl ? x0 + w - P - l.width - px : x0 + P - px
    svg = `<rect x="${rx}" y="${P - py}" width="${l.width + 2 * px}" height="${h + 2 * py}" rx="${(h + 2 * py) * 0.24}" fill="#000" fill-opacity="0.5"/>${l.svg}`
  }
  return { svg, bottom: P + h }
}

/** Stack headline/subtitle/footer bottom-up inside [top, bottom]. */
function bottomStack (ctx, { bottom, color = '#fff', subColor, maxTitleLines = 4, titleSize = fsTitle(ctx), withChip = true, accentRule = false }) {
  const P = pad(ctx); const s = scaleFor(ctx); const width = ctx.W - 2 * P
  let y = bottom
  let out = footer({ x: P, y, width, rtl: ctx.rtl, brand: ctx.brand, source: ctx.source, date: ctx.date, color, size: Math.round(24 * s), font: ctx.font, rule: true, onLight: ctx.onLight, ink: ctx.ink })
  y -= Math.round(24 * s) * 3.2
  if (ctx.subtitle) {
    const sub = fitText({ text: ctx.subtitle, width, size: Math.round(36 * s), minSize: 26 * s, maxLines: 3, font: ctx.font, weight: 400, lh: 1.45 })
    y -= sub.height
    out += textSvg({ fit: sub, x: P, y, width, rtl: ctx.rtl, color: subColor || color, opacity: subColor ? 1 : 0.86, font: ctx.font, weight: 400 })
    y -= Math.round(26 * s)
  }
  const title = fitText({ text: ctx.headline, width, size: titleSize, minSize: titleSize * 0.5, maxLines: maxTitleLines, font: ctx.font, weight: 700, lh: 1.18 })
  y -= title.height
  out += textSvg({ fit: title, x: P, y, width, rtl: ctx.rtl, color, font: ctx.font, weight: 700 })
  if (accentRule) {
    y -= Math.round(34 * s)
    out += `<rect x="${ctx.rtl ? ctx.W - P - 90 * s : P}" y="${y}" width="${90 * s}" height="${7 * s}" fill="${ctx.accent}"/>`
  }
  if (withChip) {
    y -= Math.round(34 * s) + Math.round(24 * s) * 1.75
    out += chipOf(ctx, P, y).svg
  }
  return { svg: out, top: y }
}

/** No-photo stand-in: category-tinted block with fine diagonal hatching and a large faint category word. */
function placeholder (ctx, { x = 0, y = 0, w, h, base, id = 'ph', strength = 0.6 }) {
  const s = scaleFor(ctx)
  const fill = mix(ctx.accent, base, strength)
  const step = Math.round(22 * s)
  const fam = ctx.font === 'tajawal' ? 'Tajawal' : ctx.font === 'cairo' ? 'Cairo' : 'IBM Plex Sans Arabic'
  const word = esc(ctx.label)
  return `<defs><pattern id="${id}p" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="${Math.max(1, 1.5 * s)}" height="${step}" fill="#fff" fill-opacity="0.07"/></pattern><clipPath id="${id}c"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>` +
    `<g clip-path="url(#${id}c)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}p)"/>` +
    `<text x="${ctx.rtl ? x + w + 20 * s : x - 20 * s}" y="${y + h * 0.62}" font-family="${fam}" font-weight="800" font-size="${Math.round(Math.min(w, h * 1.4) * 0.34)}" fill="#fff" fill-opacity="0.08" text-anchor="${ctx.rtl ? 'end' : 'start'}"${ctx.rtl ? ' direction="rtl"' : ''}>${word}</text></g>`
}

/** Big solid danger badge ("عاجل" / "BREAKING") + red rule running to the far edge. Returns { svg, height }. */
export function breakingBanner ({ rtl, x, y, width, size, font, red = '#E0212E' }) {
  const word = rtl ? 'عاجل' : 'BREAKING'
  const ls = rtl ? 0 : size * 0.08
  const tw = measure(word, size, font, 800, ls)
  const padX = size * 0.55; const h = size * 1.55
  const bw = tw + padX * 2
  const bx = rtl ? x + width - bw : x
  const fam = (FONTS[font] || FONTS.plex).family
  const rule = Math.max(4, size * 0.09)
  let out = `<rect x="${bx}" y="${y}" width="${bw}" height="${h}" fill="${red}"/>`
  out += `<rect x="${x}" y="${y + h - rule}" width="${width}" height="${rule}" fill="${red}"/>`
  out += `<text x="${bx + bw / 2}" y="${y + h * 0.69}" font-family="${fam}" font-weight="800" font-size="${size}" fill="#fff" text-anchor="middle"${rtl ? ' direction="rtl"' : ''}${ls ? ` letter-spacing="${ls}"` : ''}>${word}</text>`
  return { svg: out, height: h, width: bw }
}

export const LAYOUTS = {
  /** Full-bleed photo, soft bottom scrim, headline bottom. */
  'editorial-photo' (ctx) {
    const { W, H } = ctx
    let s = `<rect width="${W}" height="${H}" fill="${ctx.ink}"/>`
    s += ctx.image ? photo({ image: ctx.image, x: 0, y: 0, w: W, h: H, focus: ctx.focus }) : placeholder(ctx, { w: W, h: H, base: ctx.ink, id: 'eph', strength: 0.3 })
    s += linearScrim({ id: 'top', y: 0, w: W, h: H * 0.22, stops: [[0, '#000', 0.35], [1, '#000', 0]] })
    s += `<rect width="${W}" height="${H}" fill="${ctx.ink}" fill-opacity="0.12"/>`
    s += linearScrim({ id: 'bot', y: H * 0.25, w: W, h: H * 0.75, stops: [[0, ctx.ink, 0], [0.35, ctx.ink, 0.62], [0.6, ctx.ink, 0.88], [1, ctx.ink, 0.97]] })
    return s + bottomStack(ctx, { bottom: H - pad(ctx) }).svg + brandTop(ctx, { overPhoto: true }).svg
  },

  /** Photo on top, paper panel below (light) — calm, magazine-like. */
  'split-paper' (ctx) { return split(ctx, ctx.paper, '#14161A', '#4B5563') },
  /** Photo on top, dark panel below. */
  'split-dark' (ctx) { return split(ctx, ctx.ink, '#fff', '#C9CED6') },

  /** Big number card. stat.value e.g. "4.5%"; headline as context. */
  'big-stat' (ctx) {
    const { W, H } = ctx; const P = pad(ctx); const s = scaleFor(ctx); const width = W - 2 * P
    let out = `<rect width="${W}" height="${H}" fill="${ctx.paper}"/>`
    out += `<rect x="0" y="0" width="${W}" height="${12 * s}" fill="${ctx.accent}"/>`
    const bt = brandTop(ctx, { dark: false }); out += bt.svg
    out += chipOf(ctx, P, bt.svg ? bt.bottom + 34 * s : P + 20 * s, { outline: true }).svg
    const value = ctx.stat?.value || '—'
    const vfit = fitText({ text: value, width, size: Math.round(H * 0.2), minSize: H * 0.08, maxLines: 1, font: ctx.font, weight: 800, lh: 1 })
    const vy = H * (H > W * 1.5 ? 0.3 : 0.24)
    out += textSvg({ fit: vfit, x: P, y: vy, width, rtl: ctx.rtl, color: ctx.accent, font: ctx.font, weight: 800 })
    let y = vy + vfit.height + 18 * s
    if (ctx.stat?.label) {
      const l = fitText({ text: ctx.stat.label, width, size: Math.round(34 * s), minSize: 24 * s, maxLines: 2, font: ctx.font, weight: 500, lh: 1.35 })
      out += textSvg({ fit: l, x: P, y, width, rtl: ctx.rtl, color: '#4B5563', font: ctx.font, weight: 500 })
      y += l.height
    }
    y += 40 * s
    out += `<rect x="${P}" y="${y}" width="${width}" height="1.5" fill="#14161A" fill-opacity="0.15"/>`
    y += 46 * s
    const bottomLimit = H - P - 110 * s
    const t = fitText({ text: ctx.headline, width, size: Math.round(fsTitle(ctx) * 0.72), minSize: 30 * s, maxLines: 4, maxHeight: bottomLimit - y, font: ctx.font, weight: 700, lh: 1.25 })
    out += textSvg({ fit: t, x: P, y, width, rtl: ctx.rtl, color: '#14161A', font: ctx.font, weight: 700 })
    out += footer({ x: P, y: H - P, width, rtl: ctx.rtl, brand: ctx.brand, source: ctx.source, date: ctx.date, color: '#14161A', opacity: 0.6, size: Math.round(24 * s), font: ctx.font, onLight: true, ink: ctx.ink })
    return out
  },

  /** Typography only (Axios-like): tinted dark background, huge headline. */
  'type-only' (ctx) {
    const { W, H } = ctx; const s = scaleFor(ctx)
    let out = linearScrim({ id: 'tbg', y: 0, w: W, h: H, stops: [[0, mix(ctx.accent, ctx.ink, 0.72), 1], [1, ctx.ink, 1]] })
    out += `<circle cx="${ctx.rtl ? W * 0.05 : W * 0.95}" cy="${H * 0.08}" r="${W * 0.42}" fill="${ctx.accent}" fill-opacity="0.10"/>`
    const bt = brandTop(ctx); out += bt.svg
    const by = bt.svg ? bt.bottom + 40 * s : pad(ctx)
    out += `<rect x="${ctx.rtl ? W - pad(ctx) - 6 * s : pad(ctx)}" y="${by}" width="${6 * s}" height="${H * (bt.svg ? 0.09 : 0.12)}" fill="${ctx.accent}"/>`
    return out + bottomStack(ctx, { bottom: H - pad(ctx), titleSize: Math.round(fsTitle(ctx) * 1.12), maxTitleLines: 6 }).svg
  },

  /** Breaking: photo + strong red label strip. */
  breaking (ctx) {
    const { W, H } = ctx; const P = pad(ctx); const s = scaleFor(ctx)
    let out = `<rect width="${W}" height="${H}" fill="${ctx.ink}"/>`
    if (ctx.image) out += photo({ image: ctx.image, x: 0, y: 0, w: W, h: H, focus: ctx.focus })
    else out += placeholder(ctx, { w: W, h: H, base: ctx.ink, id: 'bph', strength: 0.3 })
    out += linearScrim({ id: 'bk', y: 0, w: W, h: H, stops: [[0, ctx.ink, 0.25], [0.45, ctx.ink, 0.6], [1, ctx.ink, 0.97]] })
    const bSize = Math.round((W > H ? 84 : H > W * 1.5 ? 110 : 96) * s)
    const bannerH = bSize * 1.55
    // Leave room for the banner above the headline; shrink headline lines if the canvas is short.
    const st = bottomStack(ctx, { bottom: H - P, withChip: false, maxTitleLines: W > H ? 3 : 4 })
    const bt = brandTop(ctx, { overPhoto: true })
    const by = Math.max(bt.svg ? bt.bottom + 40 * s : P + 30 * s, st.top - bannerH - 36 * s)
    out += breakingBanner({ rtl: ctx.rtl, x: P, y: by, width: W - 2 * P, size: bSize, font: ctx.font, red: ctx.accent }).svg
    return out + st.svg + bt.svg
  },

  /** Quote card: paper background, accent quote mark, author line. headline = quote, subtitle = author. */
  quote (ctx) {
    const { W, H } = ctx; const P = pad(ctx); const s = scaleFor(ctx); const width = W - 2 * P
    let out = `<rect width="${W}" height="${H}" fill="${ctx.paper}"/>`
    const bt = brandTop(ctx, { dark: false }); out += bt.svg
    const off = bt.svg ? bt.bottom - P + 30 * s : 0
    const qx = ctx.rtl ? W - P - 120 * s : P
    out += `<text x="${qx}" y="${P + off + 210 * s}" font-family="Georgia, serif" font-size="${300 * s}" fill="${ctx.accent}" fill-opacity="0.9">${ctx.rtl ? '”' : '“'}</text>`
    let photoH = 0
    if (ctx.image) {
      const r = 76 * s; photoH = r * 2 + 30 * s
      const cx = ctx.rtl ? P + r : W - P - r
      out += photo({ image: ctx.image, x: cx - r, y: P + off + 40 * s, w: r * 2, h: r * 2, focus: ctx.focus, id: 'qp', radius: r })
    }
    const minTop = P + off + Math.max(250 * s, photoH)
    const bottomLimit = H - P - 230 * s
    const q = fitText({ text: ctx.headline, width, size: Math.round(fsTitle(ctx) * 0.8), minSize: 34 * s, maxLines: 7, maxHeight: bottomLimit - minTop, font: ctx.font, weight: 500, lh: 1.38 })
    const block = q.height + 140 * s
    const top = Math.max(minTop, Math.min((H - block) / 2, bottomLimit - q.height))
    out += textSvg({ fit: q, x: P, y: top, width, rtl: ctx.rtl, color: '#14161A', font: ctx.font, weight: 500 })
    let y = top + q.height + 50 * s
    out += `<rect x="${ctx.rtl ? W - P - 60 * s : P}" y="${y}" width="${60 * s}" height="${5 * s}" fill="${ctx.accent}"/>`
    if (ctx.subtitle) {
      y += 30 * s
      const a = fitText({ text: ctx.subtitle, width, size: Math.round(32 * s), minSize: 24 * s, maxLines: 2, font: ctx.font, weight: 700, lh: 1.3 })
      out += textSvg({ fit: a, x: P, y, width, rtl: ctx.rtl, color: '#14161A', font: ctx.font, weight: 700 })
    }
    out += footer({ x: P, y: H - P, width, rtl: ctx.rtl, brand: ctx.brand, source: ctx.source, date: ctx.date, color: '#14161A', opacity: 0.55, size: Math.round(24 * s), font: ctx.font, onLight: true, ink: ctx.ink })
    return out
  }
}

function split (ctx, panel, color, subColor) {
  ctx = { ...ctx, onLight: panel === ctx.paper }
  const { W, H } = ctx; const P = pad(ctx); const s = scaleFor(ctx)
  const wide = W > H
  if (wide) {
    // Side-by-side for 16:9: photo on the reading-end side.
    const pw = W * 0.5
    const px = ctx.rtl ? 0 : W - pw
    let out = `<rect width="${W}" height="${H}" fill="${panel}"/>`
    out += ctx.image ? photo({ image: ctx.image, x: px, y: 0, w: pw, h: H, focus: ctx.focus }) : placeholder(ctx, { x: px, y: 0, w: pw, h: H, base: ctx.ink, id: 'sph', strength: panel === ctx.paper ? 0.25 : 0.55 })
    out += `<rect x="${ctx.rtl ? pw : px - 8 * s}" y="0" width="${8 * s}" height="${H}" fill="${ctx.accent}"/>`
    const sub = { ...ctx, W: W - pw }
    const g = bottomStack(sub, { bottom: H - P, color, subColor, titleSize: Math.round(76 * s) })
    // Brand sits top of the text panel (reading-start side).
    return out + `<g transform="translate(${ctx.rtl ? pw : 0},0)">${g.svg}${brandTop(sub, { dark: panel !== ctx.paper }).svg}</g>`
  }
  const ph = Math.round(H * (H > W * 1.5 ? 0.5 : 0.55))
  let out = `<rect width="${W}" height="${H}" fill="${panel}"/>`
  out += ctx.image ? photo({ image: ctx.image, x: 0, y: 0, w: W, h: ph, focus: ctx.focus }) : placeholder(ctx, { w: W, h: ph, base: ctx.ink, id: 'sph', strength: panel === ctx.paper ? 0.25 : 0.55 })
  out += `<rect x="0" y="${ph}" width="${W}" height="${8 * s}" fill="${ctx.accent}"/>`
  // Shrink the headline until the text stack fits below the photo.
  let size = Math.round(fsTitle(ctx) * 0.9); let g
  for (let i = 0; i < 8; i++) {
    g = bottomStack(ctx, { bottom: H - P, color, subColor, titleSize: size, maxTitleLines: 3 })
    if (g.top >= ph + P * 0.7) break
    size = Math.round(size * 0.9)
  }
  return out + g.svg + brandTop(ctx, { overPhoto: true }).svg
}
