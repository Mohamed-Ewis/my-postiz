// Real-news collection for the reel stepper: optional TheNewsAPI (THENEWSAPI_KEY) + Google News RSS
// search (no key). Then optional AI ranking/rewriting.
import { parseXmlFeed } from './rss.js'
import { generateText, aiInfo } from './ai.js'
import { createMediaFromBuffer } from './media.js'

export const NEWS_CATEGORIES = ['sport', 'economy', 'politics', 'trend', 'health', 'breaking']
export const CATEGORY_QUERIES = {
  sport: { ar: 'رياضة OR كرة القدم OR الدوري', en: 'sports OR football', keywords: ['sport', 'رياض', 'كور', 'kooora', 'football', 'yallakora', 'filgoal'], api: 'sports' },
  economy: { ar: 'اقتصاد OR البورصة OR الدولار OR أسعار', en: 'economy OR markets', keywords: ['econom', 'اقتصاد', 'business', 'مال', 'بورص', 'money', 'finance'], api: 'business' },
  politics: { ar: 'سياسة OR الحكومة OR الرئيس OR البرلمان', en: 'politics OR government', keywords: ['politic', 'سياس', 'world', 'أخبار', 'news'], api: 'politics' },
  trend: { ar: 'ترند OR السوشيال ميديا OR فن OR مشاهير', en: 'trending OR viral', keywords: ['trend', 'ترند', 'فن', 'entertain', 'celebr', 'منوعات'], api: 'entertainment' },
  health: { ar: 'صحة OR طب OR دراسة طبية', en: 'health OR medical', keywords: ['health', 'صح', 'طب', 'medic'], api: 'health' },
  breaking: { ar: 'عاجل', en: 'breaking news', keywords: ['breaking', 'عاجل', 'urgent', 'latest'], api: 'general' }
}

export function googleNewsUrl (category, lang = 'ar') {
  const q = CATEGORY_QUERIES[category] || CATEGORY_QUERIES.breaking
  const query = `${lang === 'en' ? q.en : q.ar} when:1d`
  return lang === 'en'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ar&gl=EG&ceid=EG:ar`
}

/** Normalize parsed feed/API rows → { title, summary, url, source, publishedAt, imageUrl }; dedupe, newest first. */
export function normalizeNewsItems (rows, { source = '' } = {}) {
  const seen = new Set(); const out = []
  for (const r of rows || []) {
    let title = String(r.title || '').trim(); let src = r.source || source
    // Google News titles end with " - Publisher"
    const m = title.match(/^(.*\S)\s+[-–—|]\s+([^-–—|]{2,60})$/)
    if (m && (r.fromGoogle || !src)) { title = m[1]; src = src || m[2] }
    if (!title || title.length < 8) continue
    const key = title.replace(/\s+/g, ' ').slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    const d = r.date || r.publishedAt ? new Date(r.date || r.publishedAt) : null
    const summary = String(r.summary || '').replace(/\s+/g, ' ').trim()
    out.push({ title, summary: summary && !summary.startsWith(title.slice(0, 30)) ? summary.slice(0, 400) : '', url: r.link || r.url || '', source: src || '', publishedAt: d && !isNaN(d) ? d.toISOString() : null, imageUrl: r.image || r.imageUrl || null })
  }
  return out.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
}

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; my-postiz/1.0; +news reel)' }
async function fetchText (url, ms = 10000) {
  const res = await fetch(url, { headers: { ...UA, accept: '*/*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { body: await res.text(), finalUrl: res.url }
}
export function extractOgImage (html, base = '') {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i)
  if (!m) return null
  try { const u = new URL(m[1].replace(/&amp;/g, '&'), base || undefined); return /^https?:$/.test(u.protocol) && !/(^|\.)google\.|gstatic\.com/.test(u.hostname) ? u.href : null } catch { return null }
}
async function ogImage (url) {
  if (!/^https?:\/\//.test(url)) return null
  try { const { body, finalUrl } = await fetchText(url, 6000); return extractOgImage(body.slice(0, 300000), finalUrl) } catch { return null }
}

/** Collect items. deps are injectable for tests: { fetchText, ogImage }. */
export async function searchNews ({ category = 'breaking', lang = 'ar', limit = 12, deps = {} } = {}) {
  const ft = deps.fetchText || fetchText; const og = deps.ogImage || ogImage
  const sources = []; const notices = []
  const key = process.env.THENEWSAPI_KEY
  if (key) {
    try {
      const q = CATEGORY_QUERIES[category]
      const { body } = await ft(`https://api.thenewsapi.com/v1/news/${category === 'breaking' ? 'top' : 'all'}?api_token=${encodeURIComponent(key)}&language=${lang}&categories=${q.api}&limit=10`)
      const data = JSON.parse(body).data || []
      sources.push(...normalizeNewsItems(data.map(d => ({ title: d.title, summary: d.description || d.snippet, link: d.url, source: d.source, publishedAt: d.published_at, image: d.image_url }))))
    } catch (e) { notices.push(`TheNewsAPI فشل: ${e.message}`) }
  }
  try {
    const { body } = await ft(googleNewsUrl(category, lang))
    const rows = parseXmlFeed(body).map(r => ({ ...r, fromGoogle: true }))
    sources.push(...normalizeNewsItems(rows))
  } catch (e) { notices.push(`Google News فشل: ${e.message}`) }
  const items = normalizeNewsItems(sources.map(s => ({ ...s, link: s.url, image: s.imageUrl, date: s.publishedAt }))).slice(0, limit)
  await Promise.all(items.map(async it => { if (!it.imageUrl && it.url) it.imageUrl = await og(it.url) }))
  if (!items.length) notices.push('مفيش أخبار رجعت دلوقتي — جرّب تاني أو أضف خبر يدوي')
  return { items, notices }
}

const parseJsonLoose = s => { const m = String(s || '').match(/\[[\s\S]*\]|\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null } catch { return null } }

/** AI ranks by importance and writes a short reel headline + 1-line body. Degrades gracefully. */
export async function rankAndRewrite (items, { category, lang = 'ar', gen = generateText, hasKey = aiInfo().hasKey } = {}) {
  const base = items.map(it => ({ ...it, headline: it.title, body: it.summary ? it.summary.split(/(?<=[.!؟?])\s/)[0].slice(0, 140) : '' }))
  if (!hasKey || !items.length) return { items: base, ai: false, notice: hasKey ? '' : 'مفيش مفتاح AI — العناوين الأصلية من غير ترتيب أو اختصار' }
  const list = items.map((it, i) => `${i}. ${it.title}${it.summary ? ' — ' + it.summary.slice(0, 200) : ''}`).join('\n')
  try {
    const out = await gen(`You are a news editor for a vertical ${category} news reel (${lang === 'en' ? 'English' : 'Arabic, Modern Standard, Egyptian audience'}).
Rank these items by importance (most important first) and for each write a punchy headline (max 90 chars) and a single short supporting line (max 110 chars). Do not invent facts.
Return ONLY a JSON array like [{"i":0,"headline":"...","body":"..."}].\n\n${list}`)
    const arr = parseJsonLoose(out)
    if (!Array.isArray(arr)) throw new Error('bad AI output')
    const used = new Set(); const ranked = []
    for (const r of arr) { const i = Number(r.i); if (!base[i] || used.has(i)) continue; used.add(i); ranked.push({ ...base[i], headline: String(r.headline || base[i].title).slice(0, 160), body: String(r.body || '').slice(0, 220) }) }
    base.forEach((b, i) => { if (!used.has(i)) ranked.push(b) })
    return { items: ranked, ai: true, notice: '' }
  } catch (e) { return { items: base, ai: false, notice: `الـ AI مقدرش يرتّب الأخبار (${e.message}) — العناوين الأصلية` } }
}

export async function shortenItem ({ title = '', body = '', lang = 'ar' }, { gen = generateText, hasKey = aiInfo().hasKey } = {}) {
  if (!hasKey) return { title, body, ai: false, notice: 'مفيش مفتاح AI في .env' }
  const out = await gen(`Shorten this news item for a vertical video (${lang === 'en' ? 'English' : 'Arabic'}): headline max 70 chars, one supporting line max 90 chars. Keep facts exact. Return ONLY JSON {"title":"...","body":"..."}.\n\nTitle: ${title}\nBody: ${body}`)
  const j = parseJsonLoose(out)
  return { title: String(j?.title || title).slice(0, 160), body: String(j?.body ?? body).slice(0, 220), ai: !!j }
}

const LABELS = { sport: 'رياضة', economy: 'اقتصاد', politics: 'سياسة', trend: 'ترند', health: 'صحة', breaking: 'عاجل' }
const TAGS = { sport: ['#رياضة', '#كرة_القدم'], economy: ['#اقتصاد', '#أسعار'], politics: ['#سياسة', '#أخبار'], trend: ['#ترند', '#تريند'], health: ['#صحة', '#نصائح_صحية'], breaking: ['#عاجل', '#أخبار_عاجلة'] }
/** Template caption (no AI): intro line, bullet per headline, CTA, hashtags. */
export function templateCaption (category, items, { handle = '@alkol' } = {}) {
  const lines = items.filter(i => i.title).slice(0, 8).map(i => `▪️ ${i.title}`)
  const head = category === 'breaking' ? '🔴 عاجل | أهم التطورات الآن' : `📰 أهم أخبار ${LABELS[category] || ''} اليوم`
  const tags = [...(TAGS[category] || []), '#الكل', '#أخبار_اليوم']
  return `${head}\n\n${lines.join('\n')}\n\nتابعونا ${handle} لكل جديد 👇\n\n${tags.join(' ')}`
}
export async function generateCaption (category, items, { handle = '@alkol', gen = generateText, hasKey = aiInfo().hasKey } = {}) {
  const fallback = templateCaption(category, items, { handle })
  if (!hasKey) return { caption: fallback, ai: false }
  try {
    const out = await gen(`Write a short Arabic social media caption for a vertical ${LABELS[category]} news reel from the news brand "الكل" (${handle}). Summarize these headlines in 2-3 short lines (no invented facts), end with a follow call-to-action and 5-7 relevant Arabic hashtags including #الكل. Return only the caption.\n\n${items.map(i => '- ' + i.title).join('\n')}`)
    return { caption: out.trim() || fallback, ai: !!out.trim() }
  } catch { return { caption: fallback, ai: false } }
}

/** Download an image URL into the media library (http/https only, image/*, ≤10MB). */
export async function importImage (userId, url, { name = 'news-image' } = {}) {
  let u; try { u = new URL(url) } catch { return null }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) return null
  try {
    const res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) })
    const mime = (res.headers.get('content-type') || '').split(';')[0]
    if (!res.ok || !mime.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > 10 * 1024 * 1024) return null
    return createMediaFromBuffer(userId, buf, `${name}.${mime.split('/')[1] || 'jpg'}`, mime)
  } catch { return null }
}
