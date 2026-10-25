export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id, name, content, kind } = await readBody(event)
  if (!name?.trim() || !content?.trim()) throw createError({ statusCode: 400, statusMessage: 'الاسم والنص مطلوبين' })
  const data = { name: name.trim(), content, kind: kind === 'signature' ? 'signature' : 'snippet' }
  if (id) {
    const r = await prisma.template.updateMany({ where: { id, userId }, data })
    if (!r.count) throw createError({ statusCode: 404 })
    return prisma.template.findUnique({ where: { id } })
  }
  return prisma.template.create({ data: { ...data, userId } })
})
