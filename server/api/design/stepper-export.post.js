// POST /api/design/stepper-export { ...stepper state } → renders every slide to the media library (JPEG), same order.
import { exportPoster } from '~~/server/lib/design.js'
import { localMediaUrl } from '~~/server/lib/media.js'
import { buildSlides } from '~~/server/lib/posterStepper.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  let slides
  try { slides = buildSlides(await readBody(event)) } catch (e) { throw createError({ statusCode: e.statusCode || 400, statusMessage: e.message }) }
  const media = []
  for (const s of slides) { const m = await exportPoster(userId, s); media.push({ ...m, url: localMediaUrl(m.path) }) }
  return { media }
})
