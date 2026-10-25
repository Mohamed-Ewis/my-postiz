export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { name, color } = await readBody(event)
  if (!String(name || '').trim()) throw createError({ statusCode: 400, statusMessage: 'اسم التاج مطلوب' })
  return prisma.tag.upsert({ where: { userId_name: { userId, name: name.trim() } }, update: { color: color || undefined }, create: { userId, name: name.trim(), color: color || '#6366f1' } })
})
