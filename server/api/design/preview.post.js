import { renderPoster } from '~~/server/lib/design.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const png = await renderPoster(userId, await readBody(event), { outWidth: 540 })
  setHeader(event, 'content-type', 'image/png'); setHeader(event, 'cache-control', 'no-store')
  return png
})
