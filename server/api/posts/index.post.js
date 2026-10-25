import { publishTarget } from '~~/server/lib/publisher.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { action, post, targets } = await normalizePostInput(userId, await readBody(event))
  const created = await prisma.post.create({ data: { ...post, userId, targets: { create: targets } }, include: { targets: true } })
  if (action === 'now') for (const t of created.targets) await publishTarget(t.id)
  return serializePost(await prisma.post.findUnique({ where: { id: created.id }, include: postInclude }))
})
