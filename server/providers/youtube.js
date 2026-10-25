// YouTube Data API v3 resumable upload. Docs: developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
import { defineProvider } from './base.js'
import { request, json, form, fileSize, fileStream, env } from './lib/http.js'

const label = 'YouTube'
const auth = t => ({ authorization: `Bearer ${t}` })

async function token (params) {
  const t = await json('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params })
  }, { label })
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000) }
}

export default defineProvider({
  id: 'youtube',
  name: 'YouTube',
  usePkce: true,
  envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'],
  guide: {
    ar: 'من console.cloud.google.com: اعمل Project، فعّل YouTube Data API v3، اعمل OAuth consent screen (External + ضيف إيميلك Test user)، وبعدين OAuth Client ID نوع Web وحط الـ Redirect URI.',
    en: 'In Google Cloud Console: enable YouTube Data API v3, configure the OAuth consent screen (add yourself as test user), create a Web OAuth client with this Redirect URI.'
  },
  getAuthUrl ({ state, redirectUri, codeChallenge }) {
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + form({
      client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code', scope: this.scopes.join(' '),
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
      code_challenge: codeChallenge, code_challenge_method: codeChallenge ? 'S256' : undefined
    })
  },

  async exchangeCode ({ code, redirectUri, codeVerifier }) {
    const tokens = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier })
    const r = await json('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: auth(tokens.accessToken) }, { label })
    if (!r.items?.length) throw new Error('الحساب ده مالوش قناة يوتيوب')
    return r.items.map(c => ({ externalId: c.id, name: c.snippet.title, username: c.snippet.customUrl || '', avatar: c.snippet.thumbnails?.default?.url || '', tokens }))
  },

  async refresh (refreshToken) {
    const t = await token({ grant_type: 'refresh_token', refresh_token: refreshToken })
    return { ...t, refreshToken: t.refreshToken || refreshToken }
  },

  async publish (account, input) {
    const video = input.media.find(m => m.type === 'video')
    if (!video) throw new Error('يوتيوب لازم فيديو')
    const size = video.size || await fileSize(video.path)
    const firstLine = (input.content.split('\n')[0] || 'Video').slice(0, 100)
    const meta = {
      snippet: {
        title: (input.settings.title || firstLine).replace(/[<>]/g, '').slice(0, 100),
        description: input.content.replace(/[<>]/g, '').slice(0, 5000),
        tags: input.settings.tags || [],
        categoryId: input.settings.categoryId || '22'
      },
      status: { privacyStatus: input.settings.privacy || process.env.YOUTUBE_DEFAULT_PRIVACY || 'public', selfDeclaredMadeForKids: false }
    }
    const init = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { ...auth(account.accessToken), 'content-type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': video.mimeType },
      body: JSON.stringify(meta)
    }, { label })
    const location = init.headers.get('location')
    if (!location) throw new Error('YouTube did not return an upload URL')
    // The video is created only when this upload completes; a failure mid-upload leaves nothing public.
    const res = await request(location, {
      method: 'PUT', headers: { 'content-type': video.mimeType, 'content-length': String(size) },
      body: fileStream(video.path), duplex: 'half'
    }, { safe: false, label })
    const v = await res.json()
    return { releaseId: v.id, releaseUrl: `https://www.youtube.com/watch?v=${v.id}`, pending: true }
  },

  async checkStatus (account, releaseId) {
    const r = await json(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${releaseId}`, { headers: auth(account.accessToken) }, { label })
    const v = r.items?.[0]
    if (!v) return { state: 'ERROR', error: 'Video not found' }
    if (['rejected', 'failed', 'deleted'].includes(v.status.uploadStatus)) return { state: 'ERROR', error: `YouTube ${v.status.uploadStatus}: ${v.status.rejectionReason || v.status.failureReason || ''}` }
    const p = v.processingDetails?.processingStatus
    if (v.status.uploadStatus === 'processed' || p === 'succeeded') return { state: 'PUBLISHED' }
    if (p === 'failed') return { state: 'ERROR', error: 'YouTube processing failed' }
    return { state: 'PENDING' }
  },

  async comment (account, releaseId, text) {
    const r = await json('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      method: 'POST', headers: { ...auth(account.accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({ snippet: { videoId: releaseId, topLevelComment: { snippet: { textOriginal: text } } } })
    }, { safe: false, label })
    return { id: r.id }
  },

  async analytics (account, releaseId) {
    const r = await json(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${releaseId}`, { headers: auth(account.accessToken) }, { label })
    const s = r.items?.[0]?.statistics
    return s ? { views: +s.viewCount || 0, likes: +s.likeCount || 0, comments: +s.commentCount || 0 } : null
  }
})
