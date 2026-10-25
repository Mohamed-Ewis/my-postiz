// AutoPost: poll RSS/Atom/JSON feeds, dedupe by guid/link, create drafts or queue into next free slot.
import { XMLParser } from 'fast-xml-parser'
import { prisma } from '../utils/db.js'
import { generateText } from './ai.js'
import { nextFreeSlot } from './slots.js'
import { createMediaFromBuffer, safeMediaPath } from './media.js'
import { exportPoster } from './design.js'
import { REEL_ID, normalizeReelSpec } from './video/reel.js'
import { NEWS_CATEGORIES, feedMatchesCategory } from './newsSearch.js'
import { brandCategory } from '../templates/brand/alkol.js'

const FIRST_RUN_MAX = 3
const parse = (v, d) => { try { return v ? JSON.parse(v) : d } catch { return d } }
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x])
const text = x => (x == null ? '' : typeof x === 'object' ? (x['#text'] ?? x._ ?? '') : String(x))
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const getPath = (o, path) => (path ? path.split('.').reduce((a, k) => a?.[k], o) : o)

export function parseXmlFeed (xml) {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml)
  if (doc.rss || doc['rdf:RDF']) {
    const ch = doc.rss?.channel || doc['rdf:RDF']
    return arr(ch.item || doc['rdf:RDF']?.item).map(i => ({
      guid: text(i.guid) || text(i.link),
      link: text(i.link),
      title: strip(text(i.title)),
      summary: strip(text(i.description) || text(i['content:encoded'])).slice(0, 1500),
      image: i.enclosure?.['@type']?.startsWith('image') ? i.enclosure['@url'] : (i['media:content']?.['@url'] || i['media:thumbnail']?.['@url'] || null),
      date: text(i.pubDate) || null
    }))
  }
  if (doc.feed) {
    return arr(doc.feed.entry).map(e => {
      const links = arr(e.link)
      const link = (links.find(l => !l['@rel'] || l['@rel'] === 'alternate') || links[0])?.['@href'] || ''
      return {
        guid: text(e.id) || link, link, title: strip(text(e.title)),
        summary: strip(text(e.summary) || text(e.content)).slice(0, 1500),
        image: links.find(l => l['@rel'] === 'enclosure' && l['@type']?.startsWith('image'))?.['@href'] || e['media:thumbnail']?.['@url'] || null,
        date: text(e.updated) || text(e.published) || null
      }
    })
  }
  throw new Error('Not an RSS/Atom feed')
}

export function parseJsonFeed (data, cfg = {}) {
  const items = arr((cfg.itemsPath ? getPath(data, cfg.itemsPath) : null) ?? data.items ?? data.articles ?? data.data ?? data)
  const pick = (o, field, alts) => (field ? getPath(o, field) : alts.map(a => o[a]).find(Boolean))
  return items.filter(o => o && typeof o === 'object').map(o => {
    const link = pick(o, cfg.linkField, ['url', 'link', 'permalink'])
    return {
      guid: String(pick(o, cfg.guidField, ['id', 'guid']) || link || ''),
      link: link || '',
      title: strip(pick(o, cfg.titleField, ['title', 'headline', 'name'])),
      summary: strip(pick(o, cfg.summaryField, ['summary', 'description', 'content_text', 'content', 'excerpt'])).slice(0, 1500),
      image: pick(o, cfg.imageField, ['image', 'urlToImage', 'image_url', 'thumbnail', 'banner_image']) || null
    }
  }).filter(i => i.guid)
}

export async function fetchFeedItems (feed) {
  const res = await fetch(feed.url, { headers: { 'user-agent': 'my-postiz/1.0 (+feed reader)', accept: 'application/rss+xml, application/atom+xml, application/json, text/xml, */*' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  return feed.type === 'json' ? parseJsonFeed(JSON.parse(body), parse(feed.config, {})) : parseXmlFeed(body)
}

async function buildContent (feed, item) {
  const base = [item.title, item.summary].filter(Boolean).join('\n\n')
  if (!feed.aiRewrite) return `${item.title}${item.summary ? '\n\n' + item.summary.slice(0, 500) : ''}${item.link ? '\n\n' + item.link : ''}`
  const lang = feed.language === 'en' ? 'English' : 'Modern Arabic suitable for Egyptian audience'
  const out = await generateText(`Rewrite this news item as an engaging, accurate social media post in ${lang}. Do not invent facts. 2-4 short sentences, then 3-5 hashtags. Return only the post.\n\n${base}`)
  return out + (item.link ? `\n\n${item.link}` : '')
}

async function downloadImage (userId, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const mime = (res.headers.get('content-type') || '').split(';')[0]
    if (!res.ok || !mime.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 10 * 1024 * 1024) return null
    return createMediaFromBuffer(userId, buf, url.split('/').pop()?.split('?')[0] || 'feed-image', mime)
  } catch { return null }
}

/** Process one feed. Returns number of posts created. */
export async function processFeed (feed) {
  const items = await fetchFeedItems(feed)
  const seen = new Set((await prisma.feedItem.findMany({ where: { feedId: feed.id }, select: { guid: true } })).map(x => x.guid))
  const fresh = items.filter(i => !seen.has(i.guid))
  const firstRun = seen.size === 0
  const toPost = firstRun ? fresh.slice(0, FIRST_RUN_MAX) : fresh
  const skip = firstRun ? fresh.slice(FIRST_RUN_MAX) : []
  if (skip.length) await prisma.feedItem.createMany({ data: skip.map(i => ({ feedId: feed.id, guid: i.guid, link: i.link, title: i.title?.slice(0, 300) })) })
  const accountIds = parse(feed.accountIds, [])
  let created = 0
  for (const item of toPost.reverse()) { // oldest first
    // Reserve the guid first (unique index) so two workers never double-post the same item.
    try { await prisma.feedItem.create({ data: { feedId: feed.id, guid: item.guid, link: item.link, title: item.title?.slice(0, 300) } }) } catch { continue }
    let content
    try { content = await buildContent(feed, item) } catch (e) {
      content = `${item.title}\n\n${item.link}`
      feed.lastError = `AI: ${e.message}`
    }
    let media = item.image ? await downloadImage(feed.userId, item.image) : null
    const design = parse(feed.config, {}).design
    if (design?.category && !(feed.videoMode && media)) {
      // Branded news card: the feed photo (if any) goes into the template, the poster becomes the post media.
      try {
        media = await exportPoster(feed.userId, { ...design, headline: item.title, subtitle: '', source: feed.name, lang: feed.language },
          media ? { imagePath: safeMediaPath(media.path), imageMime: media.mimeType } : {})
      } catch (e) { feed.lastError = `Poster: ${e.message}` }
    }
    if (feed.videoMode && media) { await queueFeedVideo(feed, item, content, media, accountIds); created++; continue }
    const queue = feed.mode === 'queue' && accountIds.length
    const publishAt = queue ? await nextFreeSlot(accountIds) : null
    const state = queue && publishAt ? 'QUEUE' : 'DRAFT'
    const post = await prisma.post.create({
      data: {
        userId: feed.userId, content, state, publishAt, source: `feed:${feed.id}`,
        mediaIds: JSON.stringify(media ? [media.id] : []),
        targets: { create: accountIds.map(accountId => ({ accountId, state: state === 'QUEUE' ? 'QUEUE' : 'DRAFT' })) }
      }
    })
    await prisma.feedItem.update({ where: { feedId_guid: { feedId: feed.id, guid: item.guid } }, data: { postId: post.id } })
    created++
  }
  await prisma.feed.update({ where: { id: feed.id }, data: { lastFetchedAt: new Date(), lastError: feed.lastError || null } })
  return created
}

/** Reel category for a feed: its design category (if it maps to a reel category), else guessed from name/URL, else trend. */
export function feedReelCategory (feed) {
  const c = parse(feed.config, {}).design?.category
  const mapped = c ? brandCategory(c) : null
  if (mapped && NEWS_CATEGORIES.includes(mapped)) return mapped
  return NEWS_CATEGORIES.find(k => k !== 'breaking' && feedMatchesCategory(feed, k)) || 'trend'
}

/** One-item "الكل" reel spec from a feed item (title + first sentence of the summary over the item photo). */
export function feedReelSpec (feed, item, mediaId) {
  const summary = String(item.summary || '').trim()
  const body = (summary.match(/^[^.!?؟\n]{20,}[.!?؟]/)?.[0] || summary).slice(0, 220)
  return normalizeReelSpec({
    template: REEL_ID, category: feedReelCategory(feed),
    items: [{ mediaId, title: item.title, body: body === item.title ? '' : body }],
    afterRender: feed.mode === 'queue' ? 'queue' : 'draft'
  })
}

/**
 * "Make video" mode (items with a photo): post is created as DRAFT now; a news-reel render job attaches the
 * video and (in queue mode) releases it into the next free slot when rendering finishes.
 */
async function queueFeedVideo (feed, item, content, media, accountIds) {
  const spec = feedReelSpec(feed, item, media.id)
  const post = await prisma.post.create({
    data: {
      userId: feed.userId, content, state: 'DRAFT', source: `feed:${feed.id}`,
      targets: { create: accountIds.map(accountId => ({ accountId, state: 'DRAFT' })) }
    }
  })
  await prisma.feedItem.update({ where: { feedId_guid: { feedId: feed.id, guid: item.guid } }, data: { postId: post.id } })
  await prisma.videoJob.create({
    data: { userId: feed.userId, kind: 'render', title: item.title?.slice(0, 120) || 'feed reel', postId: post.id, spec: JSON.stringify(spec) }
  })
}

export async function pollFeeds () {
  const feeds = await prisma.feed.findMany({ where: { enabled: true } })
  let n = 0
  for (const f of feeds) {
    if (f.lastFetchedAt && Date.now() - f.lastFetchedAt.getTime() < f.intervalMin * 60000) continue
    f.lastError = null
    try { n += await processFeed(f) } catch (e) {
      await prisma.feed.update({ where: { id: f.id }, data: { lastFetchedAt: new Date(), lastError: e.message } })
    }
  }
  return n
}
