import { getProvider } from '~~/server/providers/index.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const provider = getProvider(getRouterParam(event, 'provider'))
  const query = getQuery(event)
  const saved = await consumeOAuthCookie(event)

  if (query.error) return sendRedirect(event, `/accounts?error=${encodeURIComponent(String(query.error))}`)
  if (!saved || saved.provider !== provider.id || saved.state !== query.state) {
    return sendRedirect(event, '/accounts?error=invalid_state')
  }

  try {
    const accounts = await provider.exchangeCode({
      code: String(query.code || ''),
      redirectUri: redirectUriFor(event, provider.id),
      codeVerifier: saved.codeVerifier,
      query
    })
    for (const a of accounts) {
      const data = {
        name: a.name,
        username: a.username || null,
        avatar: a.avatar || null,
        accessToken: encryptToken(a.tokens.accessToken),
        refreshToken: encryptToken(a.tokens.refreshToken),
        tokenExpiresAt: a.tokens.expiresAt || null,
        refreshNeeded: false,
        meta: JSON.stringify(a.meta || {})
      }
      await prisma.socialAccount.upsert({
        where: { userId_provider_externalId: { userId, provider: provider.id, externalId: a.externalId } },
        update: data,
        create: { ...data, userId, provider: provider.id, externalId: a.externalId }
      })
    }
    return sendRedirect(event, `/accounts?connected=${provider.id}`)
  } catch (e) {
    console.error('[oauth callback]', e)
    return sendRedirect(event, `/accounts?error=${encodeURIComponent(e.message || 'exchange_failed')}`)
  }
})
