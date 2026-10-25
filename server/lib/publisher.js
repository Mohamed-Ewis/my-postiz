// Framework-free publishing core, shared by the Nitro API ("Post now") and worker/index.js.
import { prisma } from '../utils/db.js'
import { decryptToken, encryptToken } from '../utils/crypto.js'
import { getProvider } from '../providers/index.js'
import { safeMediaPath, publicMediaUrl } from './media.js'
import { getSetting } from './settings.js'

const MAX_ATTEMPTS = 3
const STALE_MS = 10 * 60 * 1000
const PENDING_MAX_MS = 3 * 3600 * 1000
const PENDING_INTERVAL_MS = 30 * 1000
const parse = (v, d) => { try { return v ? JSON.parse(v) : d } catch { return d } }

export function accountCtx (a) {
  return { id: a.id, externalId: a.externalId, username: a.username, accessToken: decryptToken(a.accessToken), meta: parse(a.meta, {}) }
}

/** Refresh a short-lived token right before use (providers with refreshWindowMs). Returns the fresh DB row. */
export async function ensureFreshToken (a, provider) {
  if (!provider.refreshWindowMs || !a.tokenExpiresAt || a.tokenExpiresAt - Date.now() > 5 * 60_000) return a
  const refresh = decryptToken(a.refreshToken)
  if (!refresh) return a
  const t = await provider.refresh(refresh, accountCtx(a))
  return prisma.socialAccount.update({
    where: { id: a.id },
    data: { accessToken: encryptToken(t.accessToken), refreshToken: encryptToken(t.refreshToken || refresh), tokenExpiresAt: t.expiresAt || null, refreshNeeded: false }
  })
}

/** Recompute Post.state from its targets. */
export async function refreshPostState (postId) {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { targets: true } })
  if (!post || post.state === 'DRAFT') return
  const s = post.targets.map(t => t.state)
  const active = s.some(x => ['QUEUE', 'PUBLISHING', 'PROCESSING'].includes(x))
  let state = 'QUEUE'
  if (s.length && s.every(x => x === 'PUBLISHED')) state = 'PUBLISHED'
  else if (s.some(x => x === 'ERROR') && !active) state = 'ERROR'
  const error = post.targets.filter(t => t.error && t.state === 'ERROR').map(t => t.error).join(' | ') || null
  await prisma.post.update({ where: { id: postId }, data: { state, error } })
}

async function claim (targetId) {
  const r = await prisma.postTarget.updateMany({
    where: { id: targetId, state: 'QUEUE' },
    data: { state: 'PUBLISHING', lockedAt: new Date(), attempts: { increment: 1 } }
  })
  return r.count === 1
}

async function loadMedia (mediaIds) {
  if (!mediaIds.length) return []
  const rows = await prisma.media.findMany({ where: { id: { in: mediaIds } } })
  return mediaIds.map(id => rows.find(m => m.id === id)).filter(Boolean).map(m => ({
    id: m.id, type: m.type, mimeType: m.mimeType, size: m.size, path: safeMediaPath(m.path), url: publicMediaUrl(m)
  }))
}

/** After success: optional first comment. Comment failure never fails the post. */
async function afterPublished (target, provider, account) {
  const text = target.post.firstComment?.trim()
  if (!text || !provider.comment || target.commentId) return
  try {
    const c = await provider.comment(account, target.releaseId, text)
    await prisma.postTarget.update({ where: { id: target.id }, data: { commentId: c.id || 'ok' } })
  } catch (e) {
    await prisma.postTarget.update({ where: { id: target.id }, data: { commentId: 'failed', error: `First comment failed: ${e.message}` } })
  }
}

async function markFailure (t, e) {
  const retry = e.retryable && t.attempts < MAX_ATTEMPTS
  // Rate limits carry the provider's reset time (e.g. X x-rate-limit-reset); otherwise exponential backoff.
  const delay = e.retryAt ? Math.max(5_000, new Date(e.retryAt) - Date.now()) : 60_000 * 2 ** Math.max(0, t.attempts - 1)
  await prisma.postTarget.update({
    where: { id: t.id },
    data: retry
      ? { state: 'QUEUE', error: e.message, nextAttemptAt: new Date(Date.now() + delay), lockedAt: null }
      : { state: 'ERROR', error: e.message, lockedAt: null }
  })
  if (e.refreshNeeded) await prisma.socialAccount.update({ where: { id: t.accountId }, data: { refreshNeeded: true } })
}

async function withDefaults (provider, settings) {
  if (provider === 'youtube' && !settings.privacy) settings.privacy = await getSetting('youtubePrivacy')
  if (provider === 'tiktok' && !settings.privacy) settings.privacy = await getSetting('tiktokPrivacy')
  return settings
}

export async function publishTarget (targetId) {
  if (!(await claim(targetId))) return { skipped: true }
  const t = await prisma.postTarget.findUnique({ where: { id: targetId }, include: { post: true, account: true } })
  try {
    if (t.account.disabled) throw new Error('الحساب متوقف (Disabled)')
    if (t.account.refreshNeeded) throw Object.assign(new Error('الحساب محتاج Reconnect من صفحة الحسابات'), { refreshNeeded: true })
    const provider = getProvider(t.account.provider)
    const account = accountCtx(await ensureFreshToken(t.account, provider))
    const res = await provider.publish(
      account,
      { content: t.content || t.post.content, media: await loadMedia(parse(t.post.mediaIds, [])), settings: await withDefaults(t.account.provider, parse(t.settings, {})) },
      { targetId: t.id }
    )
    const updated = await prisma.postTarget.update({
      where: { id: t.id },
      data: res.pending
        ? { state: 'PROCESSING', releaseId: res.releaseId, releaseUrl: res.releaseUrl || null, error: null, lockedAt: null, nextAttemptAt: new Date(Date.now() + PENDING_INTERVAL_MS) }
        : { state: 'PUBLISHED', releaseId: res.releaseId, releaseUrl: res.releaseUrl || null, error: null, publishedAt: new Date(), lockedAt: null },
      include: { post: true }
    })
    if (!res.pending) await afterPublished(updated, provider, account)
  } catch (e) {
    await markFailure(t, e)
  }
  await refreshPostState(t.postId)
  return { done: true }
}

/** Poll video platforms for targets still processing. */
export async function checkPending (limit = 20) {
  const now = new Date()
  const list = await prisma.postTarget.findMany({
    where: { state: 'PROCESSING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    include: { post: true, account: true }, take: limit
  })
  for (const t of list) {
    const provider = getProvider(t.account.provider)
    let r; let account = accountCtx(t.account)
    try { account = accountCtx(await ensureFreshToken(t.account, provider)); r = await provider.checkStatus(account, t.releaseId) } catch (e) {
      r = e.retryable ? { state: 'PENDING' } : { state: 'ERROR', error: e.message }
    }
    if (r.state === 'PENDING' && now - t.updatedAt > PENDING_MAX_MS && now - t.createdAt > PENDING_MAX_MS) r = { state: 'ERROR', error: 'Processing timed out' }
    if (r.state === 'PENDING') {
      await prisma.postTarget.update({ where: { id: t.id }, data: { nextAttemptAt: new Date(Date.now() + PENDING_INTERVAL_MS) } })
      continue
    }
    const updated = await prisma.postTarget.update({
      where: { id: t.id },
      data: r.state === 'PUBLISHED'
        ? { state: 'PUBLISHED', publishedAt: new Date(), releaseId: r.releaseId || t.releaseId, releaseUrl: r.releaseUrl || t.releaseUrl, error: null }
        : { state: 'ERROR', error: r.error || 'Failed' },
      include: { post: true }
    })
    if (r.state === 'PUBLISHED') await afterPublished(updated, provider, account)
    await refreshPostState(t.postId)
  }
  return list.length
}

/** Refresh tokens expiring within 3 days. Failures flag the account for reconnect. */
export async function refreshTokens () {
  const soon = new Date(Date.now() + 3 * 864e5)
  const list = await prisma.socialAccount.findMany({ where: { refreshNeeded: false, disabled: false, tokenExpiresAt: { lt: soon } } })
  let n = 0
  for (const a of list) {
    let provider
    try { provider = getProvider(a.provider) } catch { continue }
    // Short-lived tokens (X: 2h) are refreshed only shortly before expiry (their refresh tokens rotate).
    const windowMs = provider.refreshWindowMs || 3 * 864e5
    if (a.tokenExpiresAt && a.tokenExpiresAt - Date.now() > windowMs) continue
    const refresh = decryptToken(a.refreshToken)
    try {
      if (!refresh) throw new Error('no refresh token')
      const t = await provider.refresh(refresh, accountCtx(a))
      await prisma.socialAccount.update({
        where: { id: a.id },
        data: { accessToken: encryptToken(t.accessToken), refreshToken: encryptToken(t.refreshToken || refresh), tokenExpiresAt: t.expiresAt || null, refreshNeeded: false }
      })
      n++
    } catch (e) {
      if (e.retryable) continue
      // Not expired yet? keep trying next round; mark only when it really expires (or is already expired).
      if (!a.tokenExpiresAt || a.tokenExpiresAt < new Date(Date.now() + Math.min(864e5, windowMs))) {
        await prisma.socialAccount.update({ where: { id: a.id }, data: { refreshNeeded: true } })
      }
    }
  }
  return n
}

/** Find due targets and publish them one by one. */
export async function runDue (limit = 20) {
  const now = new Date()
  // Targets stuck in PUBLISHING (crash mid-publish) are NOT retried: the post may already be live.
  const stale = await prisma.postTarget.findMany({ where: { state: 'PUBLISHING', lockedAt: { lt: new Date(Date.now() - STALE_MS) } } })
  for (const s of stale) {
    await prisma.postTarget.update({ where: { id: s.id }, data: { state: 'ERROR', error: 'Interrupted while publishing; check the channel before retrying', lockedAt: null } })
    await refreshPostState(s.postId)
  }
  const due = await prisma.postTarget.findMany({
    where: { state: 'QUEUE', post: { state: 'QUEUE', publishAt: { lte: now } }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    select: { id: true }, orderBy: { createdAt: 'asc' }, take: limit
  })
  let n = 0
  for (const d of due) { const r = await publishTarget(d.id); if (r.done) n++ }
  return n
}

/** Fetch analytics for each published target that supports it. */
export async function fetchAnalytics (postId) {
  const targets = await prisma.postTarget.findMany({ where: { postId, state: 'PUBLISHED' }, include: { account: true } })
  const out = []
  for (const t of targets) {
    const provider = getProvider(t.account.provider)
    let data = null; let error = null
    if (!provider.analytics) error = 'not_supported'
    else {
      try { data = await provider.analytics(accountCtx(t.account), t.releaseId) } catch (e) { error = e.message }
      if (data) await prisma.postTarget.update({ where: { id: t.id }, data: { analytics: JSON.stringify(data), analyticsAt: new Date() } })
    }
    out.push({ targetId: t.id, provider: t.account.provider, account: t.account.name, data: data || parse(t.analytics, null), error })
  }
  return out
}
