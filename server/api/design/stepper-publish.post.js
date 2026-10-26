// POST /api/design/stepper-publish { action: 'now'|'schedule', content, mediaIds, accountIds, publishAt }
// Splits targets by each platform's image limit (one post per distinct media set) and creates the posts.
import { publishTarget } from '~~/server/lib/publisher.js'
import { planPublish } from '~~/server/lib/posterStepper.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  const mediaIds = (b.mediaIds || []).filter(Boolean)
  if (!mediaIds.length) throw createError({ statusCode: 400, statusMessage: 'مفيش صور للنشر' })
  const accounts = await prisma.socialAccount.findMany({ where: { userId, id: { in: b.accountIds || [] } } })
  const plan = planPublish(accounts, mediaIds)
  if (!plan.posts.length) throw createError({ statusCode: 400, statusMessage: plan.warnings[0] || 'اختار حساب يدعم الصور' })
  const out = []
  for (const g of plan.posts) {
    const { action, post, targets } = await normalizePostInput(userId, { action: b.action, content: b.content, mediaIds: g.mediaIds, targets: g.accountIds.map(accountId => ({ accountId })), publishAt: b.publishAt })
    const created = await prisma.post.create({ data: { ...post, userId, targets: { create: targets } }, include: { targets: true } })
    if (action === 'now') for (const t of created.targets) await publishTarget(t.id)
    out.push(created.id)
  }
  return { postIds: out, warnings: plan.warnings }
})
