import { nextFreeSlot } from '~~/server/lib/slots.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const ids = String(getQuery(event).accounts || '').split(',').filter(Boolean)
  const owned = await prisma.socialAccount.findMany({ where: { userId, id: { in: ids } }, select: { id: true } })
  if (!owned.length) throw createError({ statusCode: 400, statusMessage: 'اختار حساب الأول' })
  const at = await nextFreeSlot(owned.map(o => o.id))
  if (!at) throw createError({ statusCode: 404, statusMessage: 'مفيش ميعاد فاضي في الـ 30 يوم الجايين' })
  return { at }
})
