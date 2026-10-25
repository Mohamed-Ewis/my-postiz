// Re-queue failed targets (user confirmed the post is not live on the channel).
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  const post = await prisma.post.findFirst({ where: { id, userId } })
  if (!post) throw createError({ statusCode: 404 })
  await prisma.postTarget.updateMany({ where: { postId: id, state: 'ERROR' }, data: { state: 'QUEUE', error: null, attempts: 0, nextAttemptAt: null } })
  await prisma.post.update({ where: { id }, data: { state: 'QUEUE', error: null, publishAt: post.publishAt && post.publishAt > new Date() ? post.publishAt : new Date() } })
  return { ok: true }
})
