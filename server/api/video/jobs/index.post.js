// Create a "الكل" news reel render job ({ title, spec: { template: 'news-reel', ... } }).
import { REEL_ID, normalizeReelSpec } from '~~/server/lib/video/reel.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  if (b?.spec?.template !== REEL_ID) throw createError({ statusCode: 400, statusMessage: 'المتاح دلوقتي ريل الأخبار بس' })
  let reel
  try { reel = normalizeReelSpec(b.spec) } catch (e) { throw createError({ statusCode: e.statusCode || 400, statusMessage: e.message }) }
  const ids = [...reel.items.map(i => i.mediaId), reel.music?.mediaId].filter(Boolean)
  if ((await prisma.media.count({ where: { userId, id: { in: ids } } })) !== new Set(ids).size) throw createError({ statusCode: 400, statusMessage: 'Invalid media' })
  return prisma.videoJob.create({ data: { userId, kind: 'render', title: String(b.title || reel.items[0].title).slice(0, 120), spec: JSON.stringify(reel) } })
})
