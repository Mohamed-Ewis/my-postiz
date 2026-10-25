export default defineEventHandler(async (event) => {
  await prisma.template.deleteMany({ where: { id: getRouterParam(event, 'id'), userId: await requireUserId(event) } })
  return { ok: true }
})
