// POST /api/video/news-ai { action: 'shorten', title, body } | { action: 'caption', category, items, handle }
//      | { action: 'import', items: [{ imageUrl, title }] } → downloads images into the media library.
import { shortenItem, generateCaption, importImage } from '~~/server/lib/newsSearch.js'
import { localMediaUrl } from '~~/server/lib/media.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  try {
    if (b.action === 'shorten') return await shortenItem({ title: String(b.title || ''), body: String(b.body || ''), lang: b.lang })
    if (b.action === 'caption') return await generateCaption(b.category, (b.items || []).slice(0, 20).map(i => ({ title: String(i.title || '') })), { handle: b.handle || '@alkol' })
    if (b.action === 'import') {
      const out = []
      for (const it of (b.items || []).slice(0, 20)) {
        const m = it.imageUrl ? await importImage(userId, it.imageUrl, { name: 'news' }) : null
        out.push(m ? { ...m, url: localMediaUrl(m.path) } : null)
      }
      return { media: out }
    }
  } catch (e) { throw createError({ statusCode: e.statusCode || 502, statusMessage: e.message }) }
  throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
})
