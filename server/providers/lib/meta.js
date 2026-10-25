// Shared Facebook Login helpers (Facebook Pages + Instagram Business use the same Meta app).
import { json, form, env } from './http.js'

export const graphVersion = () => env('FACEBOOK_GRAPH_VERSION') || 'v23.0'
export const graph = (path) => `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, '')}`
export const graphVideo = (path) => `https://graph-video.facebook.com/${graphVersion()}/${path.replace(/^\//, '')}`

export function metaAuthUrl ({ state, redirectUri, scopes }) {
  const u = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`)
  u.search = form({ client_id: env('FACEBOOK_APP_ID'), redirect_uri: redirectUri, state, scope: scopes.join(','), response_type: 'code' }).toString()
  return u.toString()
}

/** code -> long-lived user token (60 days). Page tokens derived from it don't expire. */
export async function metaUserToken (code, redirectUri) {
  const short = await json(graph('oauth/access_token') + '?' + form({ client_id: env('FACEBOOK_APP_ID'), client_secret: env('FACEBOOK_APP_SECRET'), redirect_uri: redirectUri, code }), {}, { label: 'Meta token' })
  const long = await json(graph('oauth/access_token') + '?' + form({ grant_type: 'fb_exchange_token', client_id: env('FACEBOOK_APP_ID'), client_secret: env('FACEBOOK_APP_SECRET'), fb_exchange_token: short.access_token }), {}, { label: 'Meta long token' })
  return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null }
}

export async function metaPages (userToken, fields) {
  const out = []
  let url = graph('me/accounts') + '?' + form({ fields, limit: 100, access_token: userToken })
  while (url) {
    const r = await json(url, {}, { label: 'Meta pages' })
    out.push(...(r.data || []))
    url = r.paging?.next || null
  }
  return out
}
