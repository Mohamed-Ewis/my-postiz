import { getProvider } from '~~/server/providers/index.js'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const provider = getProvider(getRouterParam(event, 'provider'))
  if (!provider.isConfigured()) {
    return sendRedirect(event, `/accounts?error=${encodeURIComponent('المنصة دي محتاجة إعداد: ' + provider.envVars.join(', '))}`)
  }
  const state = randomString(24)
  const codeVerifier = provider.usePkce ? randomString(48) : undefined
  await setOAuthCookie(event, { provider: provider.id, state, codeVerifier })
  const url = await provider.getAuthUrl({
    state,
    redirectUri: redirectUriFor(event, provider.id),
    codeChallenge: codeVerifier ? pkceChallenge(codeVerifier) : undefined
  })
  return sendRedirect(event, url)
})
