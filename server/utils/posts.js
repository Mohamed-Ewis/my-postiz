const STATES = ['DRAFT', 'QUEUE']

/** Validate body and build Post data. action: draft | now | schedule */
export async function normalizePostInput (userId, body) {
  const action = body.action || 'draft'
  const content = String(body.content || '').trim()
  const targets = Array.isArray(body.targets) ? body.targets : []
  if (!content && !targets.some(t => t.content?.trim())) throw createError({ statusCode: 400, statusMessage: 'اكتب نص البوست الأول' })
  if (action !== 'draft' && !targets.length) throw createError({ statusCode: 400, statusMessage: 'اختار حساب واحد على الأقل' })
  const ids = targets.map(t => t.accountId)
  const owned = await prisma.socialAccount.count({ where: { userId, id: { in: ids } } })
  if (owned !== ids.length) throw createError({ statusCode: 400, statusMessage: 'Invalid account' })
  let publishAt = null
  if (action === 'now') publishAt = new Date()
  if (action === 'schedule') {
    publishAt = new Date(body.publishAt)
    if (isNaN(publishAt)) throw createError({ statusCode: 400, statusMessage: 'اختار ميعاد صحيح' })
    if (publishAt < new Date(Date.now() - 60000)) throw createError({ statusCode: 400, statusMessage: 'الميعاد في الماضي' })
  } else if (action === 'draft' && body.publishAt) publishAt = new Date(body.publishAt)
  const state = action === 'draft' ? 'DRAFT' : 'QUEUE'
  return {
    action,
    post: { content, mediaIds: JSON.stringify(body.mediaIds || []), tagIds: JSON.stringify(body.tagIds || []), firstComment: body.firstComment?.trim() || null, state, publishAt, error: null, group: body.group || null },
    targets: targets.map(t => ({
      accountId: t.accountId,
      content: t.content?.trim() ? t.content : null,
      settings: JSON.stringify(t.settings || {}),
      state: state === 'DRAFT' ? 'DRAFT' : 'QUEUE'
    }))
  }
}

export function serializePost (p) {
  return {
    ...p,
    mediaIds: parseJSON(p.mediaIds, []),
    tagIds: parseJSON(p.tagIds, []),
    targets: (p.targets || []).map(t => ({ ...t, settings: parseJSON(t.settings, {}), analytics: parseJSON(t.analytics, null) }))
  }
}

export const postInclude = { targets: { include: { account: { select: { id: true, name: true, provider: true, avatar: true, username: true } } } } }
export { STATES }
