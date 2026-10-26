// RSS/Atom parsing used by the reel news search (Google News RSS).
import { XMLParser } from 'fast-xml-parser'

const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x])
const text = x => (x == null ? '' : typeof x === 'object' ? (x['#text'] ?? x._ ?? '') : String(x))
const strip = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()

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
