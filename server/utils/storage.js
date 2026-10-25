import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { safeMediaPath } from '../lib/media.js'

export { mediaRoot, mediaTypeOf, localMediaUrl, publicMediaUrl, verifyMediaSignature, removeMediaFile, createMediaFromBuffer, createMediaFromFile } from '../lib/media.js'

export function resolveMediaPath (rel) {
  try { return safeMediaPath(rel) } catch { throw createError({ statusCode: 400, statusMessage: 'Bad path' }) }
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' }

/** Stream a file with HTTP Range support (video seeking). */
export async function sendMediaFile (event, rel) {
  const full = resolveMediaPath(rel)
  let info
  try { info = await stat(full) } catch { throw createError({ statusCode: 404, statusMessage: 'Not found' }) }
  if (!info.isFile()) throw createError({ statusCode: 404 })
  const size = info.size
  setHeader(event, 'Content-Type', MIME[extname(full).toLowerCase()] || 'application/octet-stream')
  setHeader(event, 'Accept-Ranges', 'bytes')
  setHeader(event, 'Cache-Control', 'private, max-age=3600')
  const range = getHeader(event, 'range')
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m && m[1] ? parseInt(m[1]) : NaN
    let end = m && m[2] ? parseInt(m[2]) : size - 1
    if (isNaN(start)) { start = size - end; end = size - 1 }
    if (!m || start < 0 || start >= size || end < start) {
      setHeader(event, 'Content-Range', `bytes */${size}`)
      throw createError({ statusCode: 416 })
    }
    end = Math.min(end, size - 1)
    setResponseStatus(event, 206)
    setHeader(event, 'Content-Range', `bytes ${start}-${end}/${size}`)
    setHeader(event, 'Content-Length', end - start + 1)
    return sendStream(event, createReadStream(full, { start, end }))
  }
  setHeader(event, 'Content-Length', size)
  return sendStream(event, createReadStream(full))
}
