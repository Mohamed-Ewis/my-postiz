import { test } from 'node:test'
import assert from 'node:assert/strict'
const { zonedToUtc } = await import('../server/lib/slots.js')
const { parseXmlFeed, parseJsonFeed } = await import('../server/lib/feeds.js')

test('zonedToUtc Cairo (UTC+3 in Oct 2026)', () => {
  assert.equal(zonedToUtc(2026, 10, 19, 10, 0, 'Africa/Cairo').toISOString(), '2026-10-19T07:00:00.000Z')
  assert.equal(zonedToUtc(2026, 1, 5, 10, 0, 'Africa/Cairo').toISOString(), '2026-01-05T08:00:00.000Z')
})
test('parse RSS + Atom + JSON', () => {
  const rss = parseXmlFeed('<rss><channel><item><title>A &amp; B</title><link>http://a</link><guid>g1</guid><description>&lt;p&gt;hi&lt;/p&gt;</description><enclosure url="http://i.jpg" type="image/jpeg"/></item></channel></rss>')
  assert.equal(rss[0].guid, 'g1'); assert.equal(rss[0].image, 'http://i.jpg'); assert.equal(rss[0].summary, 'hi')
  const atom = parseXmlFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>e1</id><title>T</title><link href="http://e"/></entry></feed>')
  assert.equal(atom[0].link, 'http://e')
  const j = parseJsonFeed({ articles: [{ url: 'http://j', title: 'J', urlToImage: 'http://img' }] })
  assert.equal(j[0].guid, 'http://j'); assert.equal(j[0].image, 'http://img')
  const j2 = parseJsonFeed({ data: { list: [{ uid: 5, headline: 'H', href: 'x' }] } }, { itemsPath: 'data.list', guidField: 'uid', titleField: 'headline', linkField: 'href' })
  assert.equal(j2[0].guid, '5')
})
