// X (Twitter) provider. Docs: docs.x.com — OAuth 2.0 Authorization Code with PKCE,
// POST /2/tweets, v2 media upload (POST /2/media/upload for images; /2/media/upload/initialize|{id}/append|{id}/finalize
// + GET /2/media/upload?command=STATUS for video). Access tokens live 2h; refresh tokens rotate (offline.access).
import { defineProvider, RetryableError, ProviderAuthError } from './base.js'
import { form, fileBlob, fileSize, sleep, env } from './lib/http.js'
import { xWeightedLength, splitThread, X_MAX } from '../lib/xText.js'

const label = 'X'
const API = 'https://api.x.com'
const CHUNK = 4 * 1024 * 1024 // docs: keep segments ≤ 5 MB
const IMAGE_MAX = 5 * 1024 * 1024
const PENDING = 'xpending:'

const basic = () => 'Basic ' + Buffer.from(`${env('X_CLIENT_ID')}:${env('X_CLIENT_SECRET')}`).toString('base64')

/** fetch with X-specific error classification. safe=false for the create-post call. */
export async function xRequest (url, init = {}, { safe = true } = {}) {
  let res
  try { res = await fetch(url, init) } catch (e) {
    const msg = `${label} network error: ${e.message}`
    throw safe ? new RetryableError(msg) : new Error(msg)
  }
  if (res.ok) { const t = await res.text(); return t ? JSON.parse(t) : {} }
  const text = await res.text().catch(() => '')
  let b = null; try { b = JSON.parse(text) } catch {}
  const detail = b?.detail || b?.errors?.[0]?.message || b?.error_description || b?.title || (typeof b?.error === 'string' ? b.error : '') || text.slice(0, 300) || res.statusText
  const msg = `${label} ${res.status}: ${detail}`
  if (res.status === 429) {
    const reset = Number(res.headers.get('x-rate-limit-reset')) || Number(res.headers.get('x-user-limit-24hour-reset')) || 0
    const e = new RetryableError(msg)
    e.retryAt = reset ? new Date(reset * 1000 + 2000) : new Date(Date.now() + 15 * 60_000)
    throw e
  }
  if (res.status === 401 || b?.error === 'invalid_grant') throw new ProviderAuthError(msg)
  if (res.status >= 500 && safe) throw new RetryableError(msg)
  throw Object.assign(new Error(msg), { status: res.status, body: b })
}
const auth = token => ({ authorization: `Bearer ${token}` })
const jsonH = token => ({ ...auth(token), 'content-type': 'application/json' })

async function uploadImage (token, m) {
  const size = m.size || await fileSize(m.path)
  if (size > IMAGE_MAX) throw new Error('X: الصورة أكبر من 5MB')
  const fd = new FormData()
  fd.append('media_category', m.mimeType === 'image/gif' ? 'tweet_gif' : 'tweet_image')
  fd.append('media_type', m.mimeType)
  fd.append('media', await fileBlob(m.path, m.mimeType), 'upload')
  const r = await xRequest(`${API}/2/media/upload`, { method: 'POST', headers: auth(token), body: fd })
  return r.data.id
}

/** Chunked video upload. Returns { id, processing: null | {state, check_after_secs} } */
export async function uploadVideo (token, m) {
  const size = m.size || await fileSize(m.path)
  const init = await xRequest(`${API}/2/media/upload/initialize`, { method: 'POST', headers: jsonH(token), body: JSON.stringify({ media_type: m.mimeType || 'video/mp4', total_bytes: size, media_category: 'tweet_video' }) })
  const id = init.data.id
  const blob = await fileBlob(m.path, m.mimeType)
  for (let i = 0, off = 0; off < size; i++, off += CHUNK) {
    const fd = new FormData()
    fd.append('segment_index', String(i))
    fd.append('media', blob.slice(off, Math.min(size, off + CHUNK)), `chunk${i}`)
    await xRequest(`${API}/2/media/upload/${id}/append`, { method: 'POST', headers: auth(token), body: fd })
  }
  const fin = await xRequest(`${API}/2/media/upload/${id}/finalize`, { method: 'POST', headers: auth(token) })
  return { id, processing: fin.data?.processing_info || null }
}

async function mediaStatus (token, id) {
  const r = await xRequest(`${API}/2/media/upload?` + form({ command: 'STATUS', media_id: id }), { headers: auth(token) })
  return r.data?.processing_info || { state: 'succeeded' }
}

/** Post the tweets (thread = reply chain). Retry-safe only before the first tweet exists. */
async function postTweets (token, texts, mediaIds, username) {
  const ids = []
  for (let i = 0; i < texts.length; i++) {
    const body = { text: texts[i] }
    if (i === 0 && mediaIds.length) body.media = { media_ids: mediaIds }
    if (i > 0) body.reply = { in_reply_to_tweet_id: ids[i - 1] }
    try {
      const r = await xRequest(`${API}/2/tweets`, { method: 'POST', headers: jsonH(token), body: JSON.stringify(body) }, { safe: false })
      ids.push(r.data.id)
    } catch (e) {
      if (i === 0) throw e
      // Part of the thread is already live: never auto-retry (would duplicate).
      throw new Error(`X: اتنشر ${i} من ${texts.length} في السلسلة ثم فشل: ${e.message} (أول تغريدة ${ids[0]})`)
    }
  }
  return { releaseId: ids[0], releaseUrl: `https://x.com/${username || 'i'}/status/${ids[0]}`, ids }
}

export function buildTexts (content, settings = {}) {
  const text = String(content || '').trim()
  if (settings.thread) return splitThread(text, X_MAX)
  if (!settings.longPost && xWeightedLength(text) > X_MAX) {
    throw new Error(`X: النص ${xWeightedLength(text)} حرف (الحد ${X_MAX}). فعّل «قسّمه لسلسلة» أو اختصره.`)
  }
  return [text]
}

const inlineWaitMs = () => Number(env('X_INLINE_WAIT_MS') || 45000)

export default defineProvider({
  id: 'x',
  name: 'X (Twitter)',
  usePkce: true,
  envVars: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
  refreshWindowMs: 20 * 60_000, // access tokens last 2 hours
  guide: {
    ar: 'ادخل console.x.com ← New App ← User authentication settings: فعّل OAuth 2.0، نوع التطبيق Web App (Confidential client)، صلاحيات Read and write، وحط الـ Callback URI اللي تحت بالظبط. انسخ Client ID و Client Secret لـ .env (X_CLIENT_ID / X_CLIENT_SECRET). الـ API مدفوع بالاستخدام (لازم رصيد Credits).',
    en: 'console.x.com → New App → User authentication settings: enable OAuth 2.0, type Web App (confidential client), Read and write, add the exact Callback URI below. Put Client ID/Secret in .env (X_CLIENT_ID / X_CLIENT_SECRET). The API is pay-per-use (credits required).'
  },

  getAuthUrl ({ state, redirectUri, codeChallenge }) {
    return 'https://x.com/i/oauth2/authorize?' + form({
      response_type: 'code', client_id: env('X_CLIENT_ID'), redirect_uri: redirectUri, scope: this.scopes.join(' '),
      state, code_challenge: codeChallenge, code_challenge_method: 'S256'
    })
  },

  async exchangeCode ({ code, redirectUri, codeVerifier }) {
    const t = await xRequest(`${API}/2/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic() },
      body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: env('X_CLIENT_ID') })
    })
    const me = await xRequest(`${API}/2/users/me?user.fields=profile_image_url,username,name`, { headers: auth(t.access_token) })
    return [{
      externalId: me.data.id, name: me.data.name, username: me.data.username, avatar: me.data.profile_image_url || '',
      tokens: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in || 7200) * 1000) }
    }]
  },

  async refresh (refreshToken) {
    const t = await xRequest(`${API}/2/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic() },
      body: form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env('X_CLIENT_ID') })
    })
    return { accessToken: t.access_token, refreshToken: t.refresh_token || refreshToken, expiresAt: new Date(Date.now() + (t.expires_in || 7200) * 1000) }
  },

  async publish (account, input) {
    const token = account.accessToken
    const texts = buildTexts(input.content, input.settings)
    const videos = input.media.filter(m => m.type === 'video')
    const images = input.media.filter(m => m.type === 'image')
    if (videos.length > 1 || (videos.length && images.length)) throw new Error('X: فيديو واحد بس من غير صور')
    if (images.length > 4) throw new Error('X: أقصى حاجة 4 صور')
    const mediaIds = []
    if (videos.length) {
      const v = await uploadVideo(token, videos[0])
      let p = v.processing
      const until = Date.now() + inlineWaitMs()
      while (p && !['succeeded', 'failed'].includes(p.state) && Date.now() < until) {
        await sleep(Math.min(10, p.check_after_secs || 2) * 1000)
        p = await mediaStatus(token, v.id)
      }
      if (p?.state === 'failed') throw new Error(`X: معالجة الفيديو فشلت: ${p.error?.message || ''}`)
      if (p && p.state !== 'succeeded') {
        // Still processing: worker will poll checkStatus and post when ready (state PROCESSING).
        const job = Buffer.from(JSON.stringify({ mediaId: v.id, texts })).toString('base64url')
        return { pending: true, releaseId: PENDING + job }
      }
      mediaIds.push(v.id)
    }
    for (const m of images) mediaIds.push(await uploadImage(token, m))
    return postTweets(token, texts, mediaIds, account.username)
  },

  async checkStatus (account, releaseId) {
    if (!String(releaseId).startsWith(PENDING)) return { state: 'PUBLISHED' }
    const job = JSON.parse(Buffer.from(releaseId.slice(PENDING.length), 'base64url').toString())
    const p = await mediaStatus(account.accessToken, job.mediaId)
    if (p.state === 'failed') return { state: 'ERROR', error: `X: معالجة الفيديو فشلت: ${p.error?.message || ''}` }
    if (p.state !== 'succeeded') return { state: 'PENDING' }
    try {
      const r = await postTweets(account.accessToken, job.texts, [job.mediaId], account.username)
      return { state: 'PUBLISHED', releaseId: r.releaseId, releaseUrl: r.releaseUrl }
    } catch (e) {
      if (e.retryable) return { state: 'PENDING' } // 429/5xx before anything was posted
      return { state: 'ERROR', error: e.message }
    }
  },

  async comment (account, releaseId, text) {
    const r = await xRequest(`${API}/2/tweets`, { method: 'POST', headers: jsonH(account.accessToken), body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: releaseId } }) }, { safe: false })
    return { id: r.data.id }
  }
})
