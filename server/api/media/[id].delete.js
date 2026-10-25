export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const m = await prisma.media.findFirst({ where: { id: getRouterParam(event, 'id'), userId } })
  if (!m) throw createError({ statusCode: 404 })
  await prisma.media.delete({ where: { id: m.id } })
  await removeMediaFile(m.path)
  if (m.thumbnail) await removeMediaFile(m.thumbnail)
  return { ok: true }
})
