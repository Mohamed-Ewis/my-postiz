// POST /api/design/stepper-zip { ...stepper state } → ZIP of full-size PNG slides.
import { renderPoster } from '~~/server/lib/design.js'
import { buildSlides, makeZip } from '~~/server/lib/posterStepper.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  let slides
  try { slides = buildSlides(await readBody(event)) } catch (e) { throw createError({ statusCode: e.statusCode || 400, statusMessage: e.message }) }
  const files = []
  for (const [i, s] of slides.entries()) files.push({ name: `alkol-${String(i + 1).padStart(2, '0')}.png`, data: await renderPoster(userId, s) })
  setHeader(event, 'content-type', 'application/zip'); setHeader(event, 'content-disposition', 'attachment; filename="alkol-posters.zip"')
  return makeZip(files)
})
