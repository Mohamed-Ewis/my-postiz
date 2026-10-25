// Facebook Pages via Graph API. Docs: developers.facebook.com/docs/pages-api/posts, /docs/video-api/guides/publishing
import { defineProvider, ProviderAuthError } from './base.js'
import { json, form, fileBlob } from './lib/http.js'
import { graph, graphVideo, metaAuthUrl, metaUserToken, metaPages } from './lib/meta.js'

const label = 'Facebook'

async function uploadPhoto (page, token, m, published, caption) {
  const fd = new FormData()
  fd.set('access_token', token)
  fd.set('published', String(published))
  if (caption) fd.set('caption', caption)
  fd.set('source', await fileBlob(m.path, m.mimeType), 'image')
  return json(graph(`${page}/photos`), { method: 'POST', body: fd }, { safe: !published, label })
}

export default defineProvider({
  id: 'facebook',
  name: 'Facebook Pages',
  envVars: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management'],
  guide: {
    ar: 'اعمل App من نوع Business على developers.facebook.com وضيف منتج Facebook Login، وحط الـ Redirect URI ده في Valid OAuth Redirect URIs. وضع Development كفاية لاستخدامك الشخصي.',
    en: 'Create a Business app at developers.facebook.com, add Facebook Login and register this Redirect URI. Development mode is enough for personal use.'
  },
  getAuthUrl ({ state, redirectUri }) { return metaAuthUrl({ state, redirectUri, scopes: this.scopes }) },

  async exchangeCode ({ code, redirectUri }) {
    const { token } = await metaUserToken(code, redirectUri)
    const pages = await metaPages(token, 'id,name,username,access_token,picture.type(large){url}')
    if (!pages.length) throw new Error('مفيش صفحات فيسبوك متاحة للحساب ده')
    return pages.map(p => ({
      externalId: p.id, name: p.name, username: p.username || '', avatar: p.picture?.data?.url || '',
      tokens: { accessToken: p.access_token, expiresAt: null }
    }))
  },

  async refresh () { throw new ProviderAuthError('Page tokens do not refresh; reconnect the page') },

  async publish (account, input) {
    const page = account.externalId
    const token = account.accessToken
    const videos = input.media.filter(m => m.type === 'video')
    const images = input.media.filter(m => m.type === 'image')
    const message = input.content

    if (videos.length) {
      if (videos.length > 1 || images.length) throw new Error('فيسبوك: فيديو واحد بس من غير صور في نفس البوست')
      const v = videos[0]
      const fd = new FormData()
      fd.set('access_token', token)
      fd.set('description', message)
      if (input.settings.title) fd.set('title', input.settings.title)
      fd.set('source', await fileBlob(v.path, v.mimeType), 'video')
      const r = await json(graphVideo(`${page}/videos`), { method: 'POST', body: fd }, { safe: false, label })
      return { releaseId: r.id, releaseUrl: `https://www.facebook.com/${page}/videos/${r.id}`, pending: true }
    }
    if (images.length === 1) {
      const r = await uploadPhoto(page, token, images[0], true, message)
      const id = r.post_id || r.id
      return { releaseId: id, releaseUrl: `https://www.facebook.com/${id}` }
    }
    const body = { message, access_token: token }
    if (images.length > 1) {
      const ids = []
      for (const m of images) ids.push((await uploadPhoto(page, token, m, false)).id)
      ids.forEach((id, i) => { body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
    }
    if (input.settings.link) body.link = input.settings.link
    const r = await json(graph(`${page}/feed`), { method: 'POST', body: form(body) }, { safe: false, label })
    return { releaseId: r.id, releaseUrl: `https://www.facebook.com/${r.id}` }
  },

  async checkStatus (account, releaseId) {
    const r = await json(graph(releaseId) + '?' + form({ fields: 'status', access_token: account.accessToken }), {}, { label })
    const s = r.status?.video_status
    if (s === 'ready') return { state: 'PUBLISHED' }
    if (s === 'error') return { state: 'ERROR', error: r.status?.processing_phase?.errors?.[0]?.message || 'Facebook video processing failed' }
    return { state: 'PENDING' }
  },

  async comment (account, releaseId, text) {
    const r = await json(graph(`${releaseId}/comments`), { method: 'POST', body: form({ message: text, access_token: account.accessToken }) }, { safe: false, label })
    return { id: r.id }
  },

  async analytics (account, releaseId) {
    const fields = 'shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)'
    const r = await json(graph(releaseId) + '?' + form({ fields, access_token: account.accessToken }), {}, { label })
    return { reactions: r.reactions?.summary?.total_count ?? null, comments: r.comments?.summary?.total_count ?? null, shares: r.shares?.count ?? 0 }
  }
})
