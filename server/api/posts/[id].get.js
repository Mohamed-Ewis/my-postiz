export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const p = await prisma.post.findFirst({ where: { id: getRouterParam(event, 'id'), userId }, include: postInclude })
  if (!p) throw createError({ statusCode: 404 })
  return serializePost(p)
})
