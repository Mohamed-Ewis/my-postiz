export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const j = await prisma.videoJob.findFirst({ where: { id: getRouterParam(event, 'id'), userId } })
  if (!j) throw createError({ statusCode: 404 })
  return { ...j, spec: parseJSON(j.spec, {}), externalData: undefined }
})
