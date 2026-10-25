export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const [accounts, groups, upcoming] = await Promise.all([
    prisma.socialAccount.count({ where: { userId } }),
    prisma.post.groupBy({ by: ['state'], where: { userId }, _count: true }),
    prisma.post.findMany({ where: { userId, state: 'QUEUE' }, orderBy: { publishAt: 'asc' }, take: 5, include: postInclude })
  ])
  const byState = { DRAFT: 0, QUEUE: 0, PUBLISHED: 0, ERROR: 0 }
  for (const g of groups) byState[g.state] = g._count
  return { accounts, byState, upcoming: upcoming.map(serializePost) }
})
