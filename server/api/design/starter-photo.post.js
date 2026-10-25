// Copy a bundled starter photo into the media library (name carries the credit) so it can be used in videos.
import { readFile } from 'node:fs/promises'
import { STARTER_PHOTOS } from '~~/server/templates/presets.js'
import { starterPhotoPath } from '~~/server/lib/design.js'
import { createMediaFromBuffer, localMediaUrl } from '~~/server/lib/media.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { key } = await readBody(event)
  const ph = STARTER_PHOTOS[key]
  if (!ph) throw createError({ statusCode: 400 })
  const name = `Wikimedia - ${ph.author} - ${ph.license}.jpg`
  const existing = await prisma.media.findFirst({ where: { userId, name } })
  const m = existing || await createMediaFromBuffer(userId, await readFile(starterPhotoPath(key)), name, 'image/jpeg')
  return { ...m, url: localMediaUrl(m.path) }
})
