// Instagram Business/Creator via Instagram Graph API (Facebook Login).
// Docs: developers.facebook.com/docs/instagram-platform/content-publishing
import { defineProvider, ProviderAuthError, RetryableError } from './base.js'
import { json, form, sleep } from './lib/http.js'
import { graph, metaAuthUrl, metaUserToken, metaPages } from './lib/meta.js'

const label = 'Instagram'
const NEED_URL = 'إنستجرام محتاج رابط عام للميديا: شغّل التانل (scripts/tunnel.ps1) وحط MEDIA_PUBLIC_BASE_URL في .env'

async function container (ig, token, params) {
  const r = await json(graph(`${ig}/media`), { method: 'POST', body: form({ ...params, access_token: token }) }, { label })
  return r.id
}
async function containerStatus (id, token) {
  const r = await json(graph(id) + '?' + form({ fields: 'status_code,status', access_token: token }), {}, { label })
  return r
}
async function waitFinished (id, token, maxMs) {
  const until = Date.now() + maxMs
  for (;;) {
    const r = await containerStatus(id, token)
    if (r.status_code === 'FINISHED') return true
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error(`Instagram container ${r.status_code}: ${r.status || ''}`)
    if (Date.now() > until) return false
    await sleep(Number(process.env.IG_POLL_MS) || 3000)
  }
}
async function publishContainer (ig, token, creationId) {
  const r = await json(graph(`${ig}/media_publish`), { method: 'POST', body: form({ creation_id: creationId, access_token: token }) }, { safe: false, label })
  let url = null
  try { url = (await json(graph(r.id) + '?' + form({ fields: 'permalink', access_token: token }), {}, { label })).permalink } catch {}
  return { releaseId: r.id, releaseUrl: url }
}

export default defineProvider({
  id: 'instagram',
  name: 'Instagram Business',
  envVars: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'business_management'],
  guide: {
    ar: 'نفس تطبيق فيسبوك. حساب إنستجرام لازم يكون Business/Creator ومربوط بصفحة فيسبوك. النشر محتاج MEDIA_PUBLIC_BASE_URL (تانل).',
    en: 'Same Meta app. The IG account must be Business/Creator and linked to a Facebook Page. Publishing needs MEDIA_PUBLIC_BASE_URL (tunnel).'
  },
  getAuthUrl ({ state, redirectUri }) { return metaAuthUrl({ state, redirectUri, scopes: this.scopes }) },

  async exchangeCode ({ code, redirectUri }) {
    const { token } = await metaUserToken(code, redirectUri)
    const pages = await metaPages(token, 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}')
    const out = pages.filter(p => p.instagram_business_account).map(p => ({
      externalId: p.instagram_business_account.id,
      name: p.instagram_business_account.name || p.instagram_business_account.username,
      username: p.instagram_business_account.username,
      avatar: p.instagram_business_account.profile_picture_url || '',
      tokens: { accessToken: p.access_token, expiresAt: null },
      meta: { pageId: p.id }
    }))
    if (!out.length) throw new Error('مفيش حساب إنستجرام Business مربوط بأي صفحة')
    return out
  },

  async refresh () { throw new ProviderAuthError('Reconnect Instagram') },

  async publish (account, input) {
    const ig = account.externalId
    const token = account.accessToken
    const media = input.media
    if (!media.length) throw new Error('إنستجرام لازم صورة أو فيديو')
    if (media.some(m => !m.url)) throw new Error(NEED_URL)
    const caption = input.content
    let creationId
    if (media.length === 1) {
      const m = media[0]
      creationId = await container(ig, token, m.type === 'video'
        ? { media_type: input.settings.igType === 'STORIES' ? 'STORIES' : 'REELS', video_url: m.url, caption, share_to_feed: 'true' }
        : { image_url: m.url, caption, ...(input.settings.igType === 'STORIES' ? { media_type: 'STORIES' } : {}) })
    } else {
      if (media.length > 10) throw new Error('إنستجرام: أقصى حاجة 10 عناصر في الكاروسيل')
      const children = []
      for (const m of media) {
        const id = await container(ig, token, m.type === 'video' ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: 'true' } : { image_url: m.url, is_carousel_item: 'true' })
        children.push(id)
      }
      for (const c of children) {
        // Nothing is published yet, so retrying later is safe.
        if (!(await waitFinished(c, token, 120000))) throw new RetryableError('Instagram carousel items still processing')
      }
      creationId = await container(ig, token, { media_type: 'CAROUSEL', children: children.join(','), caption })
    }
    const hasVideo = media.some(m => m.type === 'video')
    const ready = await waitFinished(creationId, token, hasVideo ? 20000 : 60000)
    if (!ready) return { releaseId: `container:${creationId}`, pending: true }
    return publishContainer(ig, token, creationId)
  },

  /** Pending = container still processing. When FINISHED we publish it here. */
  async checkStatus (account, releaseId) {
    if (!releaseId.startsWith('container:')) return { state: 'PUBLISHED' }
    const id = releaseId.slice('container:'.length)
    const r = await containerStatus(id, account.accessToken)
    if (r.status_code === 'IN_PROGRESS') return { state: 'PENDING' }
    if (r.status_code !== 'FINISHED') return { state: 'ERROR', error: `Instagram container ${r.status_code}: ${r.status || ''}` }
    const pub = await publishContainer(account.externalId, account.accessToken, id)
    return { state: 'PUBLISHED', ...pub }
  },

  async comment (account, releaseId, text) {
    const r = await json(graph(`${releaseId}/comments`), { method: 'POST', body: form({ message: text, access_token: account.accessToken }) }, { safe: false, label })
    return { id: r.id }
  },

  async analytics (account, releaseId) {
    const r = await json(graph(`${releaseId}/insights`) + '?' + form({ metric: 'reach,likes,comments,shares,saved', access_token: account.accessToken }), {}, { label })
    return Object.fromEntries((r.data || []).map(x => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? null]))
  }
})
