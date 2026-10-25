// Thumbnail for user presets (built-ins ship static thumbnails in public/presets).
import { findPreset } from '~~/server/lib/presets.js'
import { renderPoster } from '~~/server/lib/design.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const p = await findPreset(userId, getRouterParam(event, 'id'))
  if (!p) throw createError({ statusCode: 404 })
  const d = p.kind === 'video' ? { ...p.data, size: p.data.aspect || '9:16' } : p.data
  setHeader(event, 'content-type', 'image/png'); setHeader(event, 'cache-control', 'private, max-age=60')
  return renderPoster(userId, d, { outWidth: 270 })
})
