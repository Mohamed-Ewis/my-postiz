import { test } from 'node:test'
import assert from 'node:assert/strict'
const { feedReelCategory, feedReelSpec } = await import('../server/lib/feeds.js')

test('feed reel category: design category, then feed name/url, then trend', () => {
  assert.equal(feedReelCategory({ config: JSON.stringify({ design: { category: 'economy' } }) }), 'economy')
  assert.equal(feedReelCategory({ name: 'Kooora football', url: 'https://x.test/rss' }), 'sport')
  assert.equal(feedReelCategory({ name: 'Random blog', url: 'https://x.test/rss' }), 'trend')
})

test('feed reel spec: one item, first sentence as body, afterRender from feed mode', () => {
  const s = feedReelSpec({ name: 'Random', mode: 'queue' }, { title: 'عنوان الخبر', summary: 'الجملة الأولى طويلة كفاية هنا. والتانية مش هتظهر.' }, 'm1')
  assert.equal(s.template, 'news-reel')
  assert.equal(s.items.length, 1)
  assert.equal(s.items[0].mediaId, 'm1')
  assert.equal(s.items[0].body, 'الجملة الأولى طويلة كفاية هنا.')
  assert.equal(s.afterRender, 'queue')
})
