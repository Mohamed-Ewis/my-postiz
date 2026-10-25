// Query: from, to (ISO) filter by publishAt (or createdAt for undated drafts); state
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { from, to, state } = getQuery(event)
  const where = { userId }
  if (state) where.state = String(state)
  if (from || to) {
    const range = {}
    if (from) range.gte = new Date(from)
    if (to) range.lt = new Date(to)
    where.OR = [{ publishAt: range }, { publishAt: null, createdAt: range }]
  }
  const posts = await prisma.post.findMany({ where, include: postInclude, orderBy: [{ publishAt: 'asc' }, { createdAt: 'desc' }], take: 500 })
  return posts.map(serializePost)
})
