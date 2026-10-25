export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const r = await prisma.videoJob.deleteMany({ where: { id: getRouterParam(event, 'id'), userId, state: { not: 'RENDERING' } } })
  if (!r.count) throw createError({ statusCode: 409, statusMessage: 'مينفعش تحذف فيديو بيترندر دلوقتي' })
  return { ok: true }
})
