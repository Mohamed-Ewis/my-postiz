import { fetchAnalytics } from '~~/server/lib/publisher.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  if (!(await prisma.post.count({ where: { id, userId } }))) throw createError({ statusCode: 404 })
  return fetchAnalytics(id)
})
