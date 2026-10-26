// Poster rendering shared by the API and worker.
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prisma } from '../utils/db.js'
import { safeMediaPath, createMediaFromBuffer } from './media.js'
import { runFfmpeg } from './video/ffmpeg.js'
import { renderDesign, loadImage, TEMPLATES, CATEGORIES, SIZES, DEFAULT_TEMPLATE } from '../templates/index.js'
import { brandForRender } from './brand.js'
import { STARTER_PHOTOS } from '../templates/presets.js'
import { FONTS } from '../templates/index.js'
import { resolve } from 'node:path'

export const starterPhotoPath = key => STARTER_PHOTOS[key] ? resolve(process.cwd(), 'assets/presets/photos', STARTER_PHOTOS[key].file) : null

const clamp01 = v => Math.min(1, Math.max(0, Number(v)))
export function cleanDesignInput (b = {}) {
  const category = CATEGORIES[b.category] ? b.category : 'politics-economy'
  const templateId = TEMPLATES.some(t => t.id === b.templateId) ? b.templateId : DEFAULT_TEMPLATE[category]
  const s = v => String(v || '').slice(0, 400)
  return {
    templateId, category, size: SIZES[b.size] ? b.size : '4:5',
    headline: s(b.headline), subtitle: s(b.subtitle), source: s(b.source).slice(0, 80), date: s(b.date).slice(0, 40),
    lang: b.lang === 'en' ? 'en' : b.lang === 'ar' ? 'ar' : undefined,
    focus: b.focus ? { x: clamp01(b.focus.x ?? 0.5), y: clamp01(b.focus.y ?? 0.4) } : undefined,
    stat: b.stat?.value ? { value: s(b.stat.value).slice(0, 12), label: s(b.stat.label).slice(0, 80) } : null,
    mediaId: b.mediaId || null,
    starterPhoto: STARTER_PHOTOS[b.starterPhoto] ? b.starterPhoto : null,
    accent: /^#[0-9a-fA-F]{6}$/.test(b.accent || '') ? b.accent : undefined,
    font: FONTS[b.font] ? b.font : undefined
  }
}
/** Render a poster PNG buffer. `imagePath` overrides mediaId. */
export async function renderPoster (userId, input, { outWidth, imagePath, imageMime } = {}) {
  const o = cleanDesignInput(input)
  let image = null
  if (imagePath) image = await loadImage(imagePath, imageMime).catch(() => null)
  else if (o.mediaId) {
    const m = await prisma.media.findFirst({ where: { id: o.mediaId, userId } })
    if (m?.type === 'image') image = await loadImage(safeMediaPath(m.path), m.mimeType).catch(() => null)
  } else if (o.starterPhoto) image = await loadImage(starterPhotoPath(o.starterPhoto), 'image/jpeg').catch(() => null)
  // Every template renders without a photo (category-tinted stand-in), so never swap templates here.
  const templateId = o.templateId
  if (templateId === 'big-stat' && !o.stat) {
    const n = o.headline.match(/[\d٠-٩][\d٠-٩.,٫]*\s*[%٪]?/)
    if (n) o.stat = { value: n[0].trim(), label: '' }
  }
  const brand = await brandForRender()
  const date = o.date || new Intl.DateTimeFormat(o.lang === 'en' ? 'en-US' : 'ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date())
  return renderDesign({ ...o, templateId, image, brand, lang: o.lang || brand.lang, date }, outWidth)
}
export async function pngToJpeg (png) {
  const dir = await mkdtemp(join(tmpdir(), 'poster-'))
  try {
    await writeFile(join(dir, 'a.png'), png)
    await runFfmpeg(['-y', '-i', join(dir, 'a.png'), '-q:v', '2', join(dir, 'a.jpg')])
    return await readFile(join(dir, 'a.jpg'))
  } finally { await rm(dir, { recursive: true, force: true }) }
}
export async function exportPoster (userId, input, opts) {
  const jpg = await pngToJpeg(await renderPoster(userId, input, opts))
  return createMediaFromBuffer(userId, jpg, `poster-${Date.now()}.jpg`, 'image/jpeg')
}
