import { publishTarget } from '~~/server/lib/publisher.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  const existing = await prisma.post.findFirst({ where: { id, userId }, include: { targets: true } })
  if (!existing) throw createError({ statusCode: 404 })
  if (existing.targets.some(t => ['PUBLISHING', 'PROCESSING', 'PUBLISHED'].includes(t.state))) {
    throw createError({ statusCode: 409, statusMessage: 'البوست ده اتنشر (أو بيتنشر دلوقتي) ومينفعش يتعدل' })
  }
  const { action, post, targets } = await normalizePostInput(userId, await readBody(event))
  await prisma.$transaction([
    prisma.postTarget.deleteMany({ where: { postId: id } }),
    prisma.post.update({ where: { id }, data: { ...post, targets: { create: targets } } })
  ])
  if (action === 'now') {
    const ts = await prisma.postTarget.findMany({ where: { postId: id } })
    for (const t of ts) await publishTarget(t.id)
  }
  return serializePost(await prisma.post.findUnique({ where: { id }, include: postInclude }))
})
