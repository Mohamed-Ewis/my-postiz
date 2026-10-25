export default defineEventHandler(async (event) => {
  await prisma.feed.deleteMany({ where: { id: getRouterParam(event, 'id'), userId: await requireUserId(event) } })
  return { ok: true }
})
