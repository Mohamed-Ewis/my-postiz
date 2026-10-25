// Streaming multipart upload: files are piped straight to disk (no full in-memory buffering).
import Busboy from 'busboy'
import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 4096) * 1024 * 1024
  const tmpDir = join(mediaRoot(), '.tmp')
  await mkdir(tmpDir, { recursive: true })
  const req = event.node.req
  const fields = {}
  const files = []
  const writes = []

  await new Promise((resolveP, reject) => {
    let bb
    try { bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 20 } }) } catch (e) { return reject(createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data' })) }
    bb.on('field', (name, val) => { fields[name] = val })
    bb.on('file', (_name, stream, info) => {
      const tmp = join(tmpDir, randomUUID())
      const f = { tmp, filename: info.filename || 'file', mime: info.mimeType || 'application/octet-stream', truncated: false }
      stream.on('limit', () => { f.truncated = true })
      files.push(f)
      writes.push(pipeline(stream, createWriteStream(tmp)))
    })
    bb.on('error', reject)
    bb.on('close', resolveP)
    req.pipe(bb)
  })
  await Promise.all(writes)

  const out = []
  for (const f of files) {
    if (f.truncated) { await unlink(f.tmp).catch(() => {}); throw createError({ statusCode: 413, statusMessage: `الملف ${f.filename} أكبر من الحد (MAX_UPLOAD_MB)` }) }
    const isVideo = f.mime.startsWith('video/')
    const m = await createMediaFromFile(userId, f.tmp, f.filename, f.mime, {
      width: Number(fields.width) || null, height: Number(fields.height) || null,
      duration: isVideo ? (Number(fields.duration) || null) : null
    })
    out.push({ ...m, url: localMediaUrl(m.path) })
  }
  if (!out.length) throw createError({ statusCode: 400, statusMessage: 'No file' })
  return out
})
