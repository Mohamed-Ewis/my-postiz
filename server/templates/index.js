// Template engine: SVG layouts -> PNG via resvg. Used for posters, video title cards and video caption overlays.
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { imageSize } from 'image-size'
import { LAYOUTS, breakingBanner } from './layouts.js'
import { CATEGORIES, SIZES } from './categories.js'
import { fontFiles, FONTS } from './lib/fonts.js'
import { fitText, textSvg, chip, isRtlText, esc } from './lib/svg.js'

export { CATEGORIES, SIZES, FONTS }
export * as alkol from './brand/alkol.js'

export const TEMPLATES = [
  { id: 'editorial-photo', name: { ar: 'صورة كاملة + عنوان', en: 'Full-bleed photo' }, categories: '*', needsImage: true },
  { id: 'split-paper', name: { ar: 'مقسوم فاتح', en: 'Split · light' }, categories: '*', needsImage: true },
  { id: 'split-dark', name: { ar: 'مقسوم غامق', en: 'Split · dark' }, categories: '*', needsImage: true },
  { id: 'big-stat', name: { ar: 'رقم كبير', en: 'Big number' }, categories: ['politics-economy', 'sport', 'medical', 'trend'], needsStat: true },
  { id: 'type-only', name: { ar: 'عنوان فقط', en: 'Type only' }, categories: '*' },
  { id: 'breaking', name: { ar: 'عاجل', en: 'Breaking' }, categories: ['breaking', 'politics-economy', 'sport', 'medical', 'trend'], needsImage: true },
  { id: 'quote', name: { ar: 'اقتباس', en: 'Quote' }, categories: ['quote', 'politics-economy', 'sport', 'medical', 'trend'] }
]
export const DEFAULT_TEMPLATE = { sport: 'editorial-photo', 'politics-economy': 'split-paper', medical: 'split-paper', trend: 'editorial-photo', breaking: 'breaking', quote: 'quote' }

export const DEFAULT_BRAND = { primary: '#0B0F17', secondary: '#F6F4EF', accent: '', font: 'plex', handle: '', website: '', lang: 'ar', logoMediaId: null, showMark: true }

/** Load an image file as { dataUri, width, height } (JPEG/PNG/WebP/GIF). */
export async function loadImage (path, mimeType) {
  if (!path) return null
  const buf = await readFile(path)
  const dim = imageSize(buf)
  const type = mimeType || ({ '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(path).toLowerCase()] || 'image/jpeg')
  return { dataUri: `data:${type};base64,${buf.toString('base64')}`, width: dim.width, height: dim.height }
}

function makeCtx (o) {
  const [W, H] = o.width && o.height ? [o.width, o.height] : SIZES[o.size] || SIZES['4:5']
  const cat = CATEGORIES[o.category] || CATEGORIES['politics-economy']
  const brand = { ...DEFAULT_BRAND, ...(o.brand || {}) }
  const text = `${o.headline || ''} ${o.subtitle || ''}`
  const lang = o.lang || (isRtlText(text) ? 'ar' : 'en')
  return {
    W, H, rtl: lang === 'ar', lang,
    font: FONTS[o.font] ? o.font : FONTS[brand.font] ? brand.font : 'plex',
    accent: o.accent || brand.accent || cat.accent,
    label: o.label || cat.label[lang] || cat.label.en,
    headline: o.headline || '', subtitle: o.subtitle || '', source: o.source || brand.website || '', date: o.date || '',
    image: o.image || null, focus: o.focus || { x: 0.5, y: 0.4 }, stat: o.stat || null,
    brand: { logo: o.brand?.logo || null, logoDark: o.brand?.logoDark || null, handle: brand.handle, mark: brand.showMark !== false ? { category: o.category || 'neutral' } : null },
    ink: brand.primary || '#0B0F17', paper: brand.secondary || '#F6F4EF'
  }
}

export function designSvg (o) {
  const ctx = makeCtx(o)
  const t = TEMPLATES.find(x => x.id === o.templateId) || TEMPLATES[0]
  const body = LAYOUTS[t.id](ctx)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${ctx.W}" height="${ctx.H}" viewBox="0 0 ${ctx.W} ${ctx.H}">${body}</svg>`
}

export function svgToPng (svg, outWidth) {
  const r = new Resvg(svg, { fitTo: outWidth ? { mode: 'width', value: outWidth } : { mode: 'original' }, font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: 'IBM Plex Sans Arabic' } })
  return r.render().asPng()
}

/** Full poster/card PNG. */
export const renderDesign = (o, outWidth) => svgToPng(designSvg(o), outWidth)

/**
 * Video caption overlay (transparent, full-frame): lower-third with chip + headline on a dark panel with accent bar.
 */
export function overlayPng ({ width, height, text, category, lang, brand, position = 'bottom', accent }) {
  const ctx = makeCtx({ width, height, headline: text, category, lang, brand, accent })
  const s = Math.min(width, height) / 1080
  const P = Math.round(Math.min(width, height) * 0.06)
  const inner = width - 2 * P - 56 * s
  const fit = fitText({ text, width: inner, size: Math.round((height > width ? 58 : 50) * s), minSize: 34 * s, maxLines: 4, font: ctx.font, weight: 700, lh: 1.3 })
  const isBreaking = category === 'breaking'
  const bSize = Math.round((height > width ? 80 : 60) * s)
  const c = isBreaking ? { height: bSize * 1.55 } : chip({ label: ctx.label, x: 0, y: 0, rtl: false, bg: ctx.accent, size: Math.round(22 * s), font: ctx.font })
  const panelH = fit.height + 56 * s
  const totalH = c.height + (isBreaking ? 0 : 18 * s) + panelH
  const top = position === 'top' ? P + 40 * s : position === 'center' ? (height - totalH) / 2 : height - totalH - height * 0.09
  const gap = isBreaking ? 0 : 18 * s
  const chipSvg = isBreaking
    ? breakingBanner({ rtl: ctx.rtl, x: P, y: top, width: width - 2 * P, size: bSize, font: ctx.font, red: ctx.accent }).svg
    : chip({ label: ctx.label, x: ctx.rtl ? width - P : P, y: top, rtl: ctx.rtl, bg: ctx.accent, size: Math.round(22 * s), font: ctx.font }).svg
  const py = top + c.height + gap
  const barW = 8 * s
  const bar = `<rect x="${ctx.rtl ? width - P - barW : P}" y="${py}" width="${barW}" height="${panelH}" fill="${ctx.accent}"/>`
  const panel = `<rect x="${P}" y="${py}" width="${width - 2 * P}" height="${panelH}" fill="${ctx.ink}" fill-opacity="0.82"/>`
  const txt = textSvg({ fit, x: P + (ctx.rtl ? 28 : 36) * s, y: py + 26 * s, width: inner, rtl: ctx.rtl, color: '#fff', font: ctx.font, weight: 700 })
  let logo = ''
  if (brand?.logo) {
    const lw = Math.min(width, height) * 0.14; const lh = lw * brand.logo.height / brand.logo.width
    logo = `<image href="${brand.logo.dataUri}" x="${ctx.rtl ? P : width - P - lw}" y="${P}" width="${lw}" height="${lh}" preserveAspectRatio="xMidYMid meet" opacity="0.92"/>`
  }
  return svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${panel}${bar}${chipSvg}${txt}${logo}</svg>`)
}

export const listTemplates = () => TEMPLATES.map(t => ({ ...t }))
export { esc }
