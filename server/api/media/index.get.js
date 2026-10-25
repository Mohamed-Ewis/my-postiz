export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const items = await prisma.media.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return items.map(m => ({ ...m, url: localMediaUrl(m.path), thumbUrl: m.thumbnail ? localMediaUrl(m.thumbnail) : null }))
})
