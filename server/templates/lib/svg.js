// SVG building blocks: auto-fit text, chips, photos with smart crop, scrims, footer.
import { measure, FONTS } from './fonts.js'
import { lockup as brandLockup } from '../brand/alkol.js'

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const isRtlText = s => /[\u0590-\u08FF\uFB1D-\uFEFC]/.test(String(s || ''))

/** Word-wrap using real glyph widths. Returns lines or null if a single word overflows. */
export function wrapLines (text, width, size, font, weight, ls = 0) {
  const out = []
  for (const para of String(text || '').split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + w : w
      if (measure(test, size, font, weight, ls) <= width) line = test
      else {
        if (!line) return null
        out.push(line); line = w
        if (measure(w, size, font, weight, ls) > width) return null
      }
    }
    if (line) out.push(line)
  }
  return out
}

/** Fit text into width × maxLines (and optional maxHeight), shrinking from size to minSize. Avoids a lone last word when possible. */
export function fitText ({ text, width, size, minSize = size * 0.45, maxLines = 4, maxHeight = Infinity, font, weight = 700, lh = 1.2, ls = 0 }) {
  for (let s = size; s >= minSize; s = Math.floor(s * 0.94)) {
    const lines = wrapLines(text, width, s, font, weight, ls)
    if (lines && lines.length <= maxLines && lines.length * s * lh <= maxHeight) return { lines: balance(lines, width, s, font, weight, ls), size: s, height: lines.length * s * lh, lh }
  }
  const s = Math.floor(minSize)
  let lines = wrapLines(text, width, s, font, weight, ls) || [String(text)]
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S+$/, '') + ' …' }
  return { lines, size: s, height: lines.length * s * lh, lh }
}
/** Move a word down if the last line is a single short word (typographic "widow"). */
function balance (lines, width, s, font, weight, ls) {
  if (lines.length < 2) return lines
  const last = lines[lines.length - 1]
  if (last.split(' ').length > 1) return lines
  const prev = lines[lines.length - 2].split(' ')
  if (prev.length < 3) return lines
  const moved = prev.pop() + ' ' + last
  if (measure(moved, s, font, weight, ls) > width) return lines
  return [...lines.slice(0, -2), prev.join(' '), moved]
}

/**
 * Render fitted text. align: 'start' | 'center'. rtl → right-aligned from x+width.
 * y is the TOP of the block.
 */
export function textSvg ({ fit, x, y, width, rtl, align = 'start', color = '#fff', font, weight = 700, opacity = 1, ls = 0 }) {
  const fam = (FONTS[font] || FONTS.plex).family
  const anchorX = align === 'center' ? x + width / 2 : rtl ? x + width : x
  const anchor = align === 'center' ? 'middle' : rtl ? 'end' : 'start'
  const dir = rtl ? ' direction="rtl"' : ''
  return fit.lines.map((l, i) => `<text x="${anchorX.toFixed(1)}" y="${(y + fit.size * (0.92 + i * fit.lh)).toFixed(1)}" font-family="${fam}" font-weight="${weight}" font-size="${fit.size}" fill="${color}" fill-opacity="${opacity}" text-anchor="${anchor}"${dir}${ls ? ` letter-spacing="${ls}"` : ''}>${rtl ? "\u200F" + esc(l) + "\u200F" : esc(l)}</text>`).join('')
}

/** Small category label. Returns { svg, width, height }. */
export function chip ({ label, x, y, rtl, bg, color = '#fff', size = 26, font, outline = false }) {
  const latin = !isRtlText(label)
  const text = latin ? String(label).toUpperCase() : label
  const ls = latin ? size * 0.12 : 0
  const w = measure(text, size, font, 700, ls) + size * 1.3
  const h = size * 1.75
  const left = rtl ? x - w : x
  const fam = (FONTS[font] || FONTS.plex).family
  return {
    width: w, height: h,
    svg: `<rect x="${left}" y="${y}" width="${w}" height="${h}" rx="${h * 0.18}" ${outline ? `fill="none" stroke="${bg}" stroke-width="2"` : `fill="${bg}"`}/>` +
      `<text x="${left + w / 2}" y="${y + h * 0.66}" font-family="${fam}" font-weight="700" font-size="${size}" fill="${outline ? bg : color}" text-anchor="middle"${latin ? ` letter-spacing="${ls}"` : ' direction="rtl"'}>${esc(text)}</text>`
  }
}

/** Background photo with focal-point crop into a box. */
export function photo ({ image, x, y, w, h, focus = { x: 0.5, y: 0.4 }, id = 'ph', radius = 0 }) {
  if (!image) return ''
  const scale = Math.max(w / image.width, h / image.height)
  const iw = image.width * scale; const ih = image.height * scale
  const fx = Math.min(Math.max(focus.x * iw - w / 2, 0), iw - w)
  const fy = Math.min(Math.max(focus.y * ih - h / 2, 0), ih - h)
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/></clipPath></defs>` +
    `<image clip-path="url(#${id})" href="${image.dataUri}" x="${(x - fx).toFixed(1)}" y="${(y - fy).toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="none"/>`
}

export function linearScrim ({ id, x = 0, y, w, h, stops, vertical = true }) {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>`
}

/** Footer: source · date on the reading-start side, logo or handle on the other side. */
export function footer ({ x, y, width, rtl, brand, source, date, color = '#fff', opacity = 0.75, size = 24, font, rule, onLight = false, ink = '#0B0F17' }) {
  const meta = [source, date].filter(Boolean).join('  ·  ')
  const fam = (FONTS[font] || FONTS.plex).family
  let s = ''
  if (rule) s += `<rect x="${x}" y="${y - size * 1.6}" width="${width}" height="1.5" fill="${color}" fill-opacity="0.22"/>`
  if (meta) s += `<text x="${rtl ? x + width : x}" y="${y}" font-family="${fam}" font-weight="500" font-size="${size}" fill="${color}" fill-opacity="${opacity}" text-anchor="${rtl ? 'end' : 'start'}"${rtl || isRtlText(meta) ? ' direction="rtl"' : ''}>${rtl ? "\u200F" + esc(meta) + "\u200F" : esc(meta)}</text>`
  const lh = size * 1.7
  if (brand?.mark) {
    // "الكل" lockup lives top-right of the canvas (see layouts.brandTop); footer keeps source/date only.
  } else if (brand?.logo) {
    const lw = Math.min(lh * brand.logo.width / brand.logo.height, width * 0.3)
    const lhh = lw * brand.logo.height / brand.logo.width
    // On light backgrounds use the dark logo if provided, otherwise tint the logo to the ink color.
    const src = onLight && brand.logoDark ? brand.logoDark : brand.logo
    const tint = onLight && !brand.logoDark
    const [r, g, b] = [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16) / 255)
    if (tint) s += `<defs><filter id="lt"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/></filter></defs>`
    s += `<image${tint ? ' filter="url(#lt)"' : ''} href="${src.dataUri}" x="${rtl ? x : x + width - lw}" y="${y - lhh * 0.78}" width="${lw}" height="${lhh}" preserveAspectRatio="xMidYMid meet"/>`
  } else if (brand?.handle) {
    s += `<text x="${rtl ? x : x + width}" y="${y}" font-family="${fam}" font-weight="700" font-size="${size}" fill="${color}" text-anchor="${rtl ? 'start' : 'end'}">${esc(brand.handle)}</text>`
  }
  return s
}

/** Mix a hex color with another (t = 0..1 towards b). */
export function mix (a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [r1, g1, b1] = p(a); const [r2, g2, b2] = p(b)
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`
}
