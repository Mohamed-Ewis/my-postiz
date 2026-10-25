export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const feeds = await prisma.feed.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { items: true } } } })
  return feeds.map(f => ({ ...f, accountIds: parseJSON(f.accountIds, []), config: parseJSON(f.config, {}) }))
})
