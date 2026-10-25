// Create or update (when body.id) a feed.
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  if (!/^https?:\/\//.test(b.url || '')) throw createError({ statusCode: 400, statusMessage: 'رابط الفيد لازم يبدأ بـ http' })
  const ids = Array.isArray(b.accountIds) ? b.accountIds : []
  if (ids.length && (await prisma.socialAccount.count({ where: { userId, id: { in: ids } } })) !== ids.length) throw createError({ statusCode: 400, statusMessage: 'Invalid account' })
  const data = {
    name: String(b.name || b.url).slice(0, 120), url: b.url, type: b.type === 'json' ? 'json' : 'rss',
    config: JSON.stringify(b.config || {}), accountIds: JSON.stringify(ids), aiRewrite: b.aiRewrite !== false,
    language: b.language === 'en' ? 'en' : 'ar', mode: b.mode === 'queue' ? 'queue' : 'draft',
    intervalMin: Math.max(5, Number(b.intervalMin) || 30), enabled: b.enabled !== false,
    videoMode: !!b.videoMode, videoAspect: ['9:16', '1:1', '16:9'].includes(b.videoAspect) ? b.videoAspect : '9:16'
  }
  if (b.id) {
    const r = await prisma.feed.updateMany({ where: { id: b.id, userId }, data })
    if (!r.count) throw createError({ statusCode: 404 })
    return { id: b.id }
  }
  return prisma.feed.create({ data: { ...data, userId } })
})
