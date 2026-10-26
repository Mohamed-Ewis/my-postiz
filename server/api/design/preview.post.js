import { renderPoster } from '~~/server/lib/design.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const png = await renderPoster(userId, await readBody(event), { outWidth: Math.min(1080, Math.max(160, Number(getQuery(event).w) || 540)) })
  setHeader(event, 'content-type', 'image/png'); setHeader(event, 'cache-control', 'no-store')
  return png
})
