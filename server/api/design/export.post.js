import { exportPoster } from '~~/server/lib/design.js'
import { localMediaUrl } from '~~/server/lib/media.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const m = await exportPoster(userId, await readBody(event))
  return { ...m, url: localMediaUrl(m.path) }
})
