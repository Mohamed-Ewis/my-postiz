import { test } from 'node:test'
import assert from 'node:assert/strict'
import { googleNewsUrl, CATEGORY_QUERIES, NEWS_CATEGORIES, feedMatchesCategory, normalizeNewsItems, searchNews, rankAndRewrite, templateCaption, generateCaption, extractOgImage, shortenItem } from '../server/lib/newsSearch.js'

const gnRss = `<?xml version="1.0"?><rss><channel>
<item><title>الأهلي يفوز على الزمالك 2-1 في القمة - اليوم السابع</title><link>https://news.google.com/rss/articles/a1</link><pubDate>Sat, 24 Oct 2026 18:00:00 GMT</pubDate><description>&lt;a&gt;x&lt;/a&gt;</description></item>
<item><title>الأهلي يفوز على الزمالك 2-1 في القمة - مصراوي</title><link>https://news.google.com/rss/articles/a2</link><pubDate>Sat, 24 Oct 2026 17:00:00 GMT</pubDate></item>
<item><title>صلاح يسجل هدفه العاشر هذا الموسم - كووورة</title><link>https://news.google.com/rss/articles/a3</link><pubDate>Sun, 25 Oct 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`
const userRss = `<rss><channel><item><title>منتخب مصر يستعد لمباراة ودية قوية</title><link>https://site.example/n1</link><description>المنتخب يدخل معسكرا مغلقا الأسبوع المقبل. وتفاصيل أخرى.</description><enclosure url="https://site.example/i1.jpg" type="image/jpeg"/><pubDate>Sun, 25 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>`

test('category → Google News query mapping (Arabic, EG)', () => {
  for (const c of NEWS_CATEGORIES) {
    const u = new URL(googleNewsUrl(c))
    assert.equal(u.hostname, 'news.google.com')
    assert.equal(u.searchParams.get('hl'), 'ar'); assert.equal(u.searchParams.get('gl'), 'EG'); assert.equal(u.searchParams.get('ceid'), 'EG:ar')
    assert.ok(u.searchParams.get('q').startsWith(CATEGORY_QUERIES[c].ar))
  }
  assert.match(new URL(googleNewsUrl('sport')).searchParams.get('q'), /رياضة/)
  assert.match(new URL(googleNewsUrl('breaking')).searchParams.get('q'), /عاجل/)
  assert.equal(new URL(googleNewsUrl('health', 'en')).searchParams.get('hl'), 'en-US')
})

test('feeds are matched to a category by name/url keywords', () => {
  assert.ok(feedMatchesCategory({ name: 'أخبار الرياضة', url: 'https://x/rss' }, 'sport'))
  assert.ok(feedMatchesCategory({ name: 'x', url: 'https://kooora.com/rss' }, 'sport'))
  assert.ok(!feedMatchesCategory({ name: 'Health daily', url: 'https://h/rss' }, 'sport'))
})

test('normalization strips publisher suffix, dedupes, sorts newest first', () => {
  const rows = [{ title: 'خبر مهم جداً عن الاقتصاد - الشروق', link: 'u1', date: '2026-10-24T10:00:00Z', fromGoogle: true }, { title: 'خبر مهم جداً عن الاقتصاد - المصري اليوم', link: 'u2', fromGoogle: true, date: '2026-10-24T09:00:00Z' }, { title: 'قصير', link: 'u3' }, { title: 'خبر أحدث عن البورصة اليوم', link: 'u4', date: '2026-10-25T10:00:00Z', image: 'https://i/x.jpg', summary: 'ملخص' }]
  const out = normalizeNewsItems(rows)
  assert.equal(out.length, 2)
  assert.deepEqual(Object.keys(out[0]).sort(), ['imageUrl', 'publishedAt', 'source', 'summary', 'title', 'url'])
  assert.equal(out[0].title, 'خبر أحدث عن البورصة اليوم'); assert.equal(out[0].imageUrl, 'https://i/x.jpg')
  assert.equal(out[1].title, 'خبر مهم جداً عن الاقتصاد'); assert.equal(out[1].source, 'الشروق')
})

test('og:image extraction ignores google assets', () => {
  assert.equal(extractOgImage('<meta property="og:image" content="/img/a.jpg">', 'https://s.example/n'), 'https://s.example/img/a.jpg')
  assert.equal(extractOgImage('<meta content="https://www.gstatic.com/x.png" property="og:image">'), null)
  assert.equal(extractOgImage('<p>none</p>'), null)
})

test('searchNews: user feed first, then Google fallback; network mocked', async () => {
  const calls = []
  const fetchText = async url => { calls.push(url); if (url.includes('news.google.com')) return { body: gnRss }; if (url.includes('site.example')) return { body: userRss }; throw new Error('unexpected ' + url) }
  const ogImage = async url => (url.endsWith('a3') ? 'https://img.example/a3.jpg' : null)
  delete process.env.THENEWSAPI_KEY
  const { items, notices } = await searchNews({ category: 'sport', feeds: [{ name: 'رياضة', url: 'https://site.example/rss' }, { name: 'صحة', url: 'https://other/rss' }], deps: { fetchText, ogImage } })
  assert.equal(calls.length, 2); assert.ok(calls[0].includes('site.example')); assert.ok(calls[1].includes('news.google.com'))
  assert.equal(items.length, 3)
  assert.equal(items[0].title, 'منتخب مصر يستعد لمباراة ودية قوية'); assert.equal(items[0].imageUrl, 'https://site.example/i1.jpg'); assert.equal(items[0].source, 'رياضة')
  assert.equal(items.find(i => i.url.endsWith('a3')).imageUrl, 'https://img.example/a3.jpg')
  assert.equal(notices.length, 0)
})

test('searchNews survives a failing source and reports a notice', async () => {
  const { items, notices } = await searchNews({ category: 'health', deps: { fetchText: async () => { throw new Error('offline') }, ogImage: async () => null } })
  assert.equal(items.length, 0); assert.ok(notices.some(n => n.includes('Google News')))
})

test('rankAndRewrite: graceful without key, reorders with AI', async () => {
  const items = [{ title: 'أ خبر أول طويل', summary: 'سطر. وسطر' }, { title: 'ب خبر تاني طويل', summary: '' }]
  const noKey = await rankAndRewrite(items, { category: 'sport', hasKey: false })
  assert.equal(noKey.ai, false); assert.ok(noKey.notice); assert.equal(noKey.items[0].headline, 'أ خبر أول طويل'); assert.equal(noKey.items[0].body, 'سطر.')
  const ai = await rankAndRewrite(items, { category: 'sport', hasKey: true, gen: async () => '```json\n[{"i":1,"headline":"ب مختصر","body":"سطر"}]\n```' })
  assert.equal(ai.ai, true); assert.equal(ai.items[0].headline, 'ب مختصر'); assert.equal(ai.items.length, 2)
  const bad = await rankAndRewrite(items, { category: 'sport', hasKey: true, gen: async () => 'nonsense' })
  assert.equal(bad.ai, false); assert.equal(bad.items.length, 2)
  const sh = await shortenItem({ title: 't', body: 'b' }, { hasKey: false }); assert.equal(sh.ai, false); assert.equal(sh.title, 't')
})

test('caption generation: template fallback and AI path', async () => {
  const items = [{ title: 'الدولار يتراجع' }, { title: 'البورصة تربح 2%' }]
  const c = templateCaption('economy', items)
  assert.match(c, /أهم أخبار اقتصاد/); assert.match(c, /▪️ الدولار يتراجع/); assert.match(c, /#اقتصاد/); assert.match(c, /#الكل/); assert.match(c, /@alkol/)
  assert.match(templateCaption('breaking', items, { handle: '@x' }), /عاجل[\s\S]*@x[\s\S]*#عاجل/)
  assert.deepEqual(await generateCaption('economy', items, { hasKey: false }), { caption: c, ai: false })
  assert.equal((await generateCaption('economy', items, { hasKey: true, gen: async () => 'كابشن AI' })).caption, 'كابشن AI')
  assert.equal((await generateCaption('economy', items, { hasKey: true, gen: async () => { throw new Error('x') } })).ai, false)
})
