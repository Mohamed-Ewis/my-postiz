// LinkedIn member posts. Docs: learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
// Images API / Videos API for uploads; "Sign In with LinkedIn using OpenID Connect" for profile.
import { defineProvider } from './base.js'
import { request, json, form, fileBlob, fileSize, fileStream, env } from './lib/http.js'

const label = 'LinkedIn'
const API = 'https://api.linkedin.com'
const headers = token => ({
  authorization: `Bearer ${token}`,
  'LinkedIn-Version': env('LINKEDIN_VERSION') || '202509',
  'X-Restli-Protocol-Version': '2.0.0',
  'content-type': 'application/json'
})
/** Escape "little text" reserved characters for commentary. */
export const escapeLittleText = s => String(s).replace(/[\\|{}@[\]()<>#*_~]/g, c => '\\' + c)
// Hashtags are allowed as plain "#word" — keep them unescaped:
const commentaryText = s => escapeLittleText(s).replace(/\\#(?=[\p{L}\p{N}_])/gu, '#')

async function uploadImage (token, owner, m) {
  const init = await json(`${API}/rest/images?action=initializeUpload`, { method: 'POST', headers: headers(token), body: JSON.stringify({ initializeUploadRequest: { owner } }) }, { label })
  await request(init.value.uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: await fileBlob(m.path, m.mimeType) }, { label })
  return init.value.image
}

async function uploadVideo (token, owner, m) {
  const size = m.size || await fileSize(m.path)
  const init = await json(`${API}/rest/videos?action=initializeUpload`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } })
  }, { label })
  const { video, uploadInstructions, uploadToken } = init.value
  const etags = []
  for (const part of uploadInstructions) {
    const len = part.lastByte - part.firstByte + 1
    const res = await request(part.uploadUrl, {
      method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'content-length': String(len) },
      body: fileStream(m.path, { start: part.firstByte, end: part.lastByte }), duplex: 'half'
    }, { label })
    etags.push(res.headers.get('etag'))
  }
  await request(`${API}/rest/videos?action=finalizeUpload`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken: uploadToken || '', uploadedPartIds: etags } })
  }, { label })
  return video
}

export default defineProvider({
  id: 'linkedin',
  name: 'LinkedIn',
  envVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  scopes: ['openid', 'profile', 'w_member_social'],
  guide: {
    ar: 'اعمل App على linkedin.com/developers (محتاج صفحة شركة)، فعّل منتجات "Share on LinkedIn" و"Sign In with LinkedIn using OpenID Connect"، وحط الـ Redirect URI في تبويب Auth.',
    en: 'Create an app at linkedin.com/developers, add "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect", register the Redirect URI in Auth.'
  },
  getAuthUrl ({ state, redirectUri }) {
    return 'https://www.linkedin.com/oauth/v2/authorization?' + form({ response_type: 'code', client_id: env('LINKEDIN_CLIENT_ID'), redirect_uri: redirectUri, state, scope: this.scopes.join(' ') })
  },

  async exchangeCode ({ code, redirectUri }) {
    const t = await json('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: env('LINKEDIN_CLIENT_ID'), client_secret: env('LINKEDIN_CLIENT_SECRET') })
    }, { label })
    const me = await json(`${API}/v2/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } }, { label })
    return [{
      externalId: me.sub, name: me.name || `${me.given_name || ''} ${me.family_name || ''}`.trim(), avatar: me.picture || '',
      tokens: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in || 5184000) * 1000) }
    }]
  },

  async refresh (refreshToken) {
    const t = await json('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env('LINKEDIN_CLIENT_ID'), client_secret: env('LINKEDIN_CLIENT_SECRET') })
    }, { label })
    return { accessToken: t.access_token, refreshToken: t.refresh_token || refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000) }
  },

  async publish (account, input) {
    const token = account.accessToken
    const owner = `urn:li:person:${account.externalId}`
    const videos = input.media.filter(m => m.type === 'video')
    const images = input.media.filter(m => m.type === 'image')
    if (videos.length && (videos.length > 1 || images.length)) throw new Error('لينكدإن: فيديو واحد بس من غير صور')
    const body = {
      author: owner,
      commentary: commentaryText(input.content),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    }
    if (videos.length) body.content = { media: { id: await uploadVideo(token, owner, videos[0]), title: input.settings.title || '' } }
    else if (images.length === 1) body.content = { media: { id: await uploadImage(token, owner, images[0]) } }
    else if (images.length > 1) {
      const ids = []
      for (const m of images) ids.push({ id: await uploadImage(token, owner, m) })
      body.content = { multiImage: { images: ids } }
    }
    const res = await request(`${API}/rest/posts`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) }, { safe: false, label })
    const urn = res.headers.get('x-restli-id')
    return { releaseId: urn, releaseUrl: `https://www.linkedin.com/feed/update/${urn}` }
  },

  async checkStatus () { return { state: 'PUBLISHED' } },

  async comment (account, releaseId, text) {
    const actor = `urn:li:person:${account.externalId}`
    const res = await request(`${API}/rest/socialActions/${encodeURIComponent(releaseId)}/comments`, {
      method: 'POST', headers: headers(account.accessToken), body: JSON.stringify({ actor, object: releaseId, message: { text } })
    }, { safe: false, label })
    return { id: res.headers.get('x-restli-id') || '' }
  }
})
