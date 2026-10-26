// Framework-free media helpers (used by API routes, AI images, worker).
import { mkdir, writeFile, rename, stat, unlink } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../utils/db.js'

export const mediaRoot = () => resolve(process.cwd(), process.env.MEDIA_DIR || './storage/media')
export function mediaTypeOf (mime = '') {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'other'
}
export function safeMediaPath (rel) {
  const root = mediaRoot()
  const full = resolve(root, rel)
  if (full !== root && !full.startsWith(root + sep)) throw Object.assign(new Error('Bad path'), { statusCode: 400 })
  return full
}
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' }

/** Reserve a new relative path (YYYY/MM/uuid.ext) and make sure its folder exists. */
export async function newMediaPath (originalName = '', mime = '') {
  const d = new Date()
  const dir = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
  let ext = (extname(originalName) || '').toLowerCase().replace(/[^.a-z0-9]/g, '')
  if (!ext) ext = EXT[mime] || ''
  await mkdir(join(mediaRoot(), dir), { recursive: true })
  const rel = `${dir}/${randomUUID()}${ext}`
  return { rel, full: safeMediaPath(rel) }
}

export async function createMediaFromBuffer (userId, buffer, name, mime, extra = {}) {
  const { rel, full } = await newMediaPath(name, mime)
  await writeFile(full, buffer)
  return prisma.media.create({ data: { userId, name, path: rel, mimeType: mime, type: mediaTypeOf(mime), size: buffer.length, ...extra } })
}

/** Move an already-written temp file into the library. */
export async function createMediaFromFile (userId, tmpPath, name, mime, extra = {}) {
  const { rel, full } = await newMediaPath(name, mime)
  await rename(tmpPath, full)
  const { size } = await stat(full)
  return prisma.media.create({ data: { userId, name, path: rel, mimeType: mime, type: mediaTypeOf(mime), size, ...extra } })
}

export async function removeMediaFile (rel) { try { await unlink(safeMediaPath(rel)) } catch {} }
export const localMediaUrl = rel => `/media/${rel}`

// ---- Signed public URLs (so Instagram etc. can fetch through a tunnel without a session) ----
const secret = () => process.env.NUXT_SESSION_PASSWORD || 'dev-secret'
const sign = (rel, exp) => createHmac('sha256', secret()).update(`${rel}:${exp}`).digest('base64url')

export function publicMediaUrl (media, ttlSec = 6 * 3600) {
  if (media.publicUrl) return media.publicUrl
  const base = (process.env.MEDIA_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (!base) return null
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  return `${base}/media/${media.path.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sign(media.path, exp)}`
}
export function verifyMediaSignature (rel, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
  const a = Buffer.from(sign(rel, Number(exp))); const b = Buffer.from(String(sig))
  return a.length === b.length && timingSafeEqual(a, b)
}
