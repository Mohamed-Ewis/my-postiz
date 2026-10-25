// Renders text cards/overlays to transparent PNG via SVG + resvg (proper Arabic shaping & bidi with a bundled font).
import { Resvg } from '@resvg/resvg-js'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

export const FONT_FILE = () => resolve(process.cwd(), process.env.VIDEO_FONT || 'assets/fonts/Cairo.ttf')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const isRtl = s => /[\u0590-\u08FF\uFB1D-\uFEFC]/.test(s)

/** Greedy word wrap using an average glyph width estimate. */
export function wrap (text, maxWidth, fontSize) {
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)))
  const lines = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = w
      else if ((line + ' ' + w).length <= perLine) line += ' ' + w
      else { lines.push(line); line = w }
    }
    if (line) lines.push(line)
  }
  return lines
}

function render (svg, width) {
  const font = FONT_FILE()
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: existsSync(font) ? [font] : [], loadSystemFonts: !existsSync(font), defaultFontFamily: 'Cairo' }
  })
  return r.render().asPng()
}

/**
 * Caption overlay (full-frame transparent PNG) with a rounded translucent box.
 * position: bottom | center | top
 */
export function captionPng ({ text, width, height, position = 'bottom', fontScale = 1 }) {
  const fs = Math.round(Math.min(width, height) * 0.058 * fontScale)
  const lines = wrap(text, width * 0.82, fs).slice(0, 6)
  const lh = fs * 1.45
  const boxH = lines.length * lh + fs * 0.9
  const boxW = width * 0.9
  const y0 = position === 'top' ? height * 0.08 : position === 'center' ? (height - boxH) / 2 : height - boxH - height * 0.1
  const rtl = isRtl(text)
  const tspans = lines.map((l, i) => `<text x="${width / 2}" y="${y0 + fs * 0.45 + lh * (i + 0.78)}" text-anchor="middle" ${rtl ? 'direction="rtl"' : ''}>${esc(l)}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="${(width - boxW) / 2}" y="${y0}" width="${boxW}" height="${boxH}" rx="${fs * 0.5}" fill="#000" fill-opacity="0.55"/>
    <g font-family="Cairo" font-size="${fs}" fill="#fff" font-weight="700">${tspans}</g></svg>`
  return render(svg, width)
}

/** Opaque title card (intro/outro). */
export function titleCardPng ({ title, subtitle = '', width, height, colors = ['#4f46e5', '#0f172a'] }) {
  const fs = Math.round(Math.min(width, height) * 0.085)
  const tl = wrap(title, width * 0.8, fs).slice(0, 4)
  const sfs = Math.round(fs * 0.5)
  const sl = subtitle ? wrap(subtitle, width * 0.8, sfs).slice(0, 3) : []
  const total = tl.length * fs * 1.35 + (sl.length ? sfs * 0.8 + sl.length * sfs * 1.4 : 0)
  let y = (height - total) / 2 + fs
  const dir = s => (isRtl(s) ? 'direction="rtl"' : '')
  const parts = []
  for (const l of tl) { parts.push(`<text x="${width / 2}" y="${y}" font-size="${fs}" font-weight="700" text-anchor="middle" ${dir(l)}>${esc(l)}</text>`); y += fs * 1.35 }
  y += sfs * 0.4
  for (const l of sl) { parts.push(`<text x="${width / 2}" y="${y}" font-size="${sfs}" fill-opacity="0.85" text-anchor="middle" ${dir(l)}>${esc(l)}</text>`); y += sfs * 1.4 }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.85}" cy="${height * 0.12}" r="${width * 0.25}" fill="#fff" fill-opacity="0.06"/>
    <circle cx="${width * 0.1}" cy="${height * 0.9}" r="${width * 0.3}" fill="#fff" fill-opacity="0.05"/>
    <g font-family="Cairo" fill="#fff">${parts.join('')}</g></svg>`
  return render(svg, width)
}
