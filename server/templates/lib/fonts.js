// Bundled OFL fonts (Arabic + Latin). Measurement via opentype.js, rendering via resvg.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'

export const FONT_DIR = () => resolve(process.cwd(), 'assets/fonts')
export const FONTS = {
  plex: { family: 'IBM Plex Sans Arabic', label: 'IBM Plex Sans Arabic', files: { 400: 'IBMPlexSansArabic-Regular.ttf', 500: 'IBMPlexSansArabic-Medium.ttf', 700: 'IBMPlexSansArabic-Bold.ttf', 800: 'IBMPlexSansArabic-Bold.ttf' } },
  tajawal: { family: 'Tajawal', label: 'Tajawal', files: { 400: 'Tajawal-Medium.ttf', 500: 'Tajawal-Medium.ttf', 700: 'Tajawal-Bold.ttf', 800: 'Tajawal-ExtraBold.ttf' } },
  cairo: { family: 'Cairo', label: 'Cairo', files: { 400: 'Cairo.ttf', 500: 'Cairo.ttf', 700: 'Cairo.ttf', 800: 'Cairo.ttf' } }
}
export const fontFiles = () => readdirSync(FONT_DIR()).filter(f => f.endsWith('.ttf')).map(f => resolve(FONT_DIR(), f))

const cache = new Map()
function load (file) {
  if (!cache.has(file)) {
    const p = resolve(FONT_DIR(), file)
    if (!existsSync(p)) { cache.set(file, null); return null }
    const b = readFileSync(p)
    cache.set(file, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)))
  }
  return cache.get(file)
}
/** Rendered resvg weight differs from file only for Cairo (variable font renders one weight). */
export function measure (text, size, fontKey = 'plex', weight = 700, letterSpacing = 0) {
  const def = FONTS[fontKey] || FONTS.plex
  const f = load(def.files[weight] || def.files[700])
  const w = f ? f.getAdvanceWidth(String(text), size) : String(text).length * size * 0.55
  return w + letterSpacing * Math.max(0, String(text).length - 1)
}
