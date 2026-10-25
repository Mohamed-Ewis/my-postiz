// POST /api/feeds/:id?action=run  -> fetch now;  ?action=preview -> parse only
import { processFeed, fetchFeedItems } from '~~/server/lib/feeds.js'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const feed = await prisma.feed.findFirst({ where: { id: getRouterParam(event, 'id'), userId } })
  if (!feed) throw createError({ statusCode: 404 })
  try {
    if (getQuery(event).action === 'preview') return { items: (await fetchFeedItems(feed)).slice(0, 10) }
    return { created: await processFeed(feed) }
  } catch (e) {
    await prisma.feed.update({ where: { id: feed.id }, data: { lastError: e.message, lastFetchedAt: new Date() } })
    throw createError({ statusCode: 502, statusMessage: `الفيد فشل: ${e.message}` })
  }
})
