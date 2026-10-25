import { randomBytes, createHash } from 'node:crypto'
import { seal, unseal, defaults } from 'iron-webcrypto'

const COOKIE = 'mp_oauth'
const password = () => process.env.NUXT_SESSION_PASSWORD || useRuntimeConfig().session?.password

export const randomString = (n = 32) => randomBytes(n).toString('base64url')
export const pkceChallenge = v => createHash('sha256').update(v).digest('base64url')

export function redirectUriFor (event, provider) {
  const base = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
  return `${base.replace(/\/$/, '')}/api/accounts/${provider}/callback`
}

/** Store OAuth state + PKCE verifier in a sealed, httpOnly cookie for 10 minutes. */
export async function setOAuthCookie (event, data) {
  const sealed = await seal(globalThis.crypto, { ...data, exp: Date.now() + 600_000 }, password(), defaults)
  setCookie(event, COOKIE, sealed, { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, path: '/api/accounts', maxAge: 600 })
}

export async function consumeOAuthCookie (event) {
  const raw = getCookie(event, COOKIE)
  deleteCookie(event, COOKIE, { path: '/api/accounts' })
  if (!raw) return null
  try {
    const data = await unseal(globalThis.crypto, raw, password(), defaults)
    return data.exp > Date.now() ? data : null
  } catch { return null }
}
