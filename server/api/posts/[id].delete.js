export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const r = await prisma.post.deleteMany({ where: { id: getRouterParam(event, 'id'), userId } })
  if (!r.count) throw createError({ statusCode: 404 })
  return { ok: true }
})
