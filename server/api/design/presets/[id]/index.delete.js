export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  if (id.startsWith('builtin:')) throw createError({ statusCode: 403, statusMessage: 'القوالب الجاهزة مش بتتحذف' })
  const r = await prisma.designPreset.deleteMany({ where: { id, userId } })
  if (!r.count) throw createError({ statusCode: 404 })
  return { ok: true }
})
