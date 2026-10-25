import { validSlots } from '~~/server/lib/slots.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  const a = await prisma.socialAccount.findFirst({ where: { id, userId } })
  if (!a) throw createError({ statusCode: 404 })
  const body = await readBody(event)
  const data = {}
  if (body.postingTimes) data.postingTimes = JSON.stringify(validSlots(body.postingTimes))
  if (typeof body.disabled === 'boolean') data.disabled = body.disabled
  if (body.name) data.name = String(body.name)
  await prisma.socialAccount.update({ where: { id }, data })
  return { ok: true }
})
