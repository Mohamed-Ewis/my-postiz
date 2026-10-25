// TikTok Content Posting API (Direct Post, FILE_UPLOAD). Docs: developers.tiktok.com/doc/content-posting-api-reference-direct-post
import { defineProvider } from './base.js'
import { request, json, form, fileSize, fileStream, env } from './lib/http.js'

const label = 'TikTok'
const API = 'https://open.tiktokapis.com'
const MB = 1024 * 1024
const auth = t => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json; charset=UTF-8' })

/** Chunk rules: 5–64MB chunks, last chunk may be up to 128MB; files <= 64MB go as one chunk. */
export function chunkPlan (size) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 }
  const chunkSize = 10 * MB
  return { chunkSize, count: Math.floor(size / chunkSize) }
}
/** TikTok wraps errors in 200 responses too: { error: { code, message } } */
function check (r) {
  const code = r?.error?.code
  if (code && code !== 'ok') {
    const e = new Error(`${label} ${code}: ${r.error.message || ''}`)
    if (code === 'access_token_invalid') e.refreshNeeded = true
    throw e
  }
  return r.data || {}
}
async function oauth (params) {
  const t = await json(`${API}/v2/oauth/token/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), ...params })
  }, { label })
  if (t.error && !t.access_token) throw new Error(`${label} ${t.error}: ${t.error_description || ''}`)
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in || 86400) * 1000), openId: t.open_id }
}

export default defineProvider({
  id: 'tiktok',
  name: 'TikTok',
  envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  scopes: ['user.info.basic', 'video.publish', 'video.upload'],
  guide: {
    ar: 'من developers.tiktok.com: اعمل App وضيف Login Kit و Content Posting API (فعّل Direct Post)، وحط الـ Redirect URI. قبل مراجعة التطبيق النشر بيكون SELF_ONLY (خاص) بس.',
    en: 'At developers.tiktok.com add Login Kit + Content Posting API (Direct Post) and register the Redirect URI. Unaudited apps can only post as SELF_ONLY.'
  },
  getAuthUrl ({ state, redirectUri }) {
    return 'https://www.tiktok.com/v2/auth/authorize/?' + form({ client_key: env('TIKTOK_CLIENT_KEY'), response_type: 'code', scope: this.scopes.join(','), redirect_uri: redirectUri, state })
  },

  async exchangeCode ({ code, redirectUri }) {
    const tokens = await oauth({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    const u = check(await json(`${API}/v2/user/info/?fields=open_id,display_name,avatar_url,username`, { headers: auth(tokens.accessToken) }, { label })).user || {}
    return [{ externalId: u.open_id || tokens.openId, name: u.display_name || 'TikTok', username: u.username || '', avatar: u.avatar_url || '', tokens }]
  },

  async refresh (refreshToken) {
    return oauth({ grant_type: 'refresh_token', refresh_token: refreshToken })
  },

  async publish (account, input) {
    const video = input.media.find(m => m.type === 'video')
    if (!video) throw new Error('تيك توك لازم فيديو')
    const token = account.accessToken
    const creator = check(await json(`${API}/v2/post/publish/creator_info/query/`, { method: 'POST', headers: auth(token), body: '{}' }, { label }))
    let privacy = input.settings.privacy || process.env.TIKTOK_DEFAULT_PRIVACY || 'SELF_ONLY'
    if (creator.privacy_level_options?.length && !creator.privacy_level_options.includes(privacy)) privacy = creator.privacy_level_options.includes('SELF_ONLY') ? 'SELF_ONLY' : creator.privacy_level_options[0]
    const size = video.size || await fileSize(video.path)
    const { chunkSize, count } = chunkPlan(size)
    const init = check(await json(`${API}/v2/post/publish/video/init/`, {
      method: 'POST', headers: auth(token),
      body: JSON.stringify({
        post_info: { title: input.content.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count }
      })
    }, { label }))
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize
      const end = i === count - 1 ? size - 1 : start + chunkSize - 1
      // Upload failures before the final chunk leave nothing published → safe.
      await request(init.upload_url, {
        method: 'PUT',
        headers: { 'content-type': video.mimeType || 'video/mp4', 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}` },
        body: fileStream(video.path, { start, end }), duplex: 'half'
      }, { safe: i < count - 1, label })
    }
    return { releaseId: init.publish_id, releaseUrl: null, pending: true }
  },

  async checkStatus (account, releaseId) {
    const d = check(await json(`${API}/v2/post/publish/status/fetch/`, { method: 'POST', headers: auth(account.accessToken), body: JSON.stringify({ publish_id: releaseId }) }, { label }))
    if (d.status === 'PUBLISH_COMPLETE') {
      const id = d.publicaly_available_post_id?.[0] || d.publicly_available_post_id?.[0]
      return { state: 'PUBLISHED', releaseUrl: id ? `https://www.tiktok.com/@${account.username || "_"}/video/${id}` : null }
    }
    if (d.status === 'FAILED') return { state: 'ERROR', error: `TikTok: ${d.fail_reason || 'failed'}` }
    return { state: 'PENDING' }
  }
})
