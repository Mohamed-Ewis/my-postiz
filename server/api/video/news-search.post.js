// POST /api/video/news-search { category, lang } → { items: [{ title, summary, url, source, publishedAt, imageUrl, headline, body }], notices, ai }
import { searchNews, rankAndRewrite, NEWS_CATEGORIES } from '~~/server/lib/newsSearch.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  const category = NEWS_CATEGORIES.includes(b?.category) ? b.category : 'breaking'
  const lang = b?.lang === 'en' ? 'en' : 'ar'
  const feeds = await prisma.feed.findMany({ where: { userId } })
  const { items, notices } = await searchNews({ category, lang, feeds })
  const r = await rankAndRewrite(items, { category, lang })
  return { items: r.items, ai: r.ai, notices: [...notices, r.notice].filter(Boolean) }
})
