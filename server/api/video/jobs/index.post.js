// Create a local render job ({ title, spec }) or an AI video job ({ kind:'ai', provider, prompt, imageMediaId, aspect, duration }).
import { normalizeSpec } from '~~/server/lib/video/render.js'
import { REEL_ID, normalizeReelSpec } from '~~/server/lib/video/reel.js'
import { getVideoProvider } from '~~/server/video-providers/index.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  if (b.kind === 'ai') {
    const provider = getVideoProvider(b.provider || 'fal')
    if (!provider.isConfigured()) throw createError({ statusCode: 400, statusMessage: `محتاج ${provider.envVars.join(', ')} في .env` })
    if (!String(b.prompt || '').trim()) throw createError({ statusCode: 400, statusMessage: 'اكتب وصف الفيديو' })
    return prisma.videoJob.create({
      data: { userId, kind: 'ai', provider: provider.id, title: String(b.prompt).slice(0, 80), spec: JSON.stringify({ prompt: b.prompt, imageMediaId: b.imageMediaId || null, aspect: b.aspect || '9:16', duration: Number(b.duration) || 5 }) }
    })
  }
  if (b.spec?.template === REEL_ID) {
    let reel
    try { reel = normalizeReelSpec(b.spec) } catch (e) { throw createError({ statusCode: e.statusCode || 400, statusMessage: e.message }) }
    const ids = [...reel.items.map(i => i.mediaId), reel.music?.mediaId].filter(Boolean)
    if ((await prisma.media.count({ where: { userId, id: { in: ids } } })) !== new Set(ids).size) throw createError({ statusCode: 400, statusMessage: 'Invalid media' })
    return prisma.videoJob.create({ data: { userId, kind: 'render', title: String(b.title || reel.items[0].title).slice(0, 120), spec: JSON.stringify(reel) } })
  }
  let spec
  try { spec = normalizeSpec(b.spec) } catch (e) { throw createError({ statusCode: e.statusCode || 400, statusMessage: e.message }) }
  const ids = [...spec.scenes.map(s => s.mediaId), spec.music?.mediaId, spec.logoMediaId].filter(Boolean)
  if (ids.length && (await prisma.media.count({ where: { userId, id: { in: ids } } })) !== new Set(ids).size) throw createError({ statusCode: 400, statusMessage: 'Invalid media' })
  return prisma.videoJob.create({ data: { userId, kind: 'render', title: String(b.title || spec.scenes[0].text || 'video').slice(0, 120), spec: JSON.stringify(spec) } })
})
