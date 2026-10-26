import { test } from 'node:test'
import assert from 'node:assert/strict'
const { zonedToUtc } = await import('../server/lib/slots.js')
const { parseXmlFeed } = await import('../server/lib/rss.js')

test('zonedToUtc Cairo (UTC+3 in Oct 2026)', () => {
  assert.equal(zonedToUtc(2026, 10, 19, 10, 0, 'Africa/Cairo').toISOString(), '2026-10-19T07:00:00.000Z')
  assert.equal(zonedToUtc(2026, 1, 5, 10, 0, 'Africa/Cairo').toISOString(), '2026-01-05T08:00:00.000Z')
})
test('parse RSS + Atom', () => {
  const rss = parseXmlFeed('<rss><channel><item><title>A &amp; B</title><link>http://a</link><guid>g1</guid><description>&lt;p&gt;hi&lt;/p&gt;</description><enclosure url="http://i.jpg" type="image/jpeg"/></item></channel></rss>')
  assert.equal(rss[0].guid, 'g1'); assert.equal(rss[0].image, 'http://i.jpg'); assert.equal(rss[0].summary, 'hi')
  const atom = parseXmlFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>e1</id><title>T</title><link href="http://e"/></entry></feed>')
  assert.equal(atom[0].link, 'http://e')
})
