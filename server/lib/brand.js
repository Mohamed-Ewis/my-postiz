// Brand kit (stored in settings) + resolved logo image for the template engine.
import { prisma } from '../utils/db.js'
import { getSetting, setSetting } from './settings.js'
import { safeMediaPath } from './media.js'
import { DEFAULT_BRAND, loadImage, FONTS } from '../templates/index.js'

export async function getBrand () {
  return { ...DEFAULT_BRAND, ...(await getSetting('brand', {}) || {}) }
}
export async function saveBrand (b) {
  const hex = v => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : '')
  const clean = {
    primary: hex(b.primary) || DEFAULT_BRAND.primary, secondary: hex(b.secondary) || DEFAULT_BRAND.secondary, accent: hex(b.accent),
    font: FONTS[b.font] ? b.font : 'plex', handle: String(b.handle || '').slice(0, 40), website: String(b.website || '').slice(0, 80),
    lang: b.lang === 'en' ? 'en' : 'ar', logoMediaId: b.logoMediaId || null, logoDarkMediaId: b.logoDarkMediaId || null,
    showMark: b.showMark !== false
  }
  await setSetting('brand', clean)
  return clean
}
async function mediaImage (id) {
  if (!id) return null
  const m = await prisma.media.findUnique({ where: { id } })
  if (!m || m.type !== 'image') return null
  try { return await loadImage(safeMediaPath(m.path), m.mimeType) } catch { return null }
}
/** Brand object ready for templates: colors/font + { logo, logoDark } images. */
export async function brandForRender () {
  const b = await getBrand()
  return { ...b, logo: await mediaImage(b.logoMediaId), logoDark: await mediaImage(b.logoDarkMediaId) }
}
