import { listProviders } from '~~/server/providers/index.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, provider: true, name: true, username: true, avatar: true, refreshNeeded: true, disabled: true, tokenExpiresAt: true, postingTimes: true },
    orderBy: { createdAt: 'asc' }
  })
  const base = (useRuntimeConfig().public.appUrl || getRequestURL(event).origin).replace(/\/$/, '')
  return {
    accounts: accounts.map(a => ({ ...a, postingTimes: parseJSON(a.postingTimes, []) })),
    providers: listProviders().map(p => ({ ...p, redirectUri: `${base}/api/accounts/${p.id}/callback` }))
  }
})
