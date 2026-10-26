import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const P = await import('../server/lib/posterStepper.js')
const T = await import('../server/templates/index.js')
const item = n => ({ headline: `خبر رقم ${n}`, subtitle: 'تفاصيل', mediaId: null })

test('single mode needs exactly one item', () => {
  assert.equal(P.buildSlides({ category: 'sport', mode: 'single', templateId: 'x', items: [item(1)] }).length, 1)
  assert.throws(() => P.normalizeStepper({ category: 'sport', mode: 'single', items: [item(1), item(2)] }), /خبر واحد/)
  assert.throws(() => P.normalizeStepper({ category: 'nope', mode: 'single', items: [item(1)] }), /الفئة/)
  assert.throws(() => P.normalizeStepper({ category: 'sport', mode: 'single', items: [{ headline: ' ' }] }), /عنوان/)
})
test('carousel: 2..10 slides, cover first, same template/colour on all', () => {
  const s = P.buildSlides({ category: 'economy', mode: 'carousel', cover: true, templateId: 'split-paper', size: '1:1', items: [item(1), { ...item(2), mediaId: 'm2' }, item(3)] })
  assert.equal(s.length, 4)
  assert.match(s[0].headline, /الكل \| اقتصاد/); assert.equal(s[0].mediaId, 'm2')
  assert.deepEqual(s.slice(1).map(x => x.headline), ['خبر رقم 1', 'خبر رقم 2', 'خبر رقم 3'])
  for (const x of s) { assert.equal(x.templateId, 'split-paper'); assert.equal(x.accent, '#FFB300'); assert.equal(x.category, 'politics-economy'); assert.equal(x.size, '1:1') }
  assert.throws(() => P.normalizeStepper({ category: 'sport', mode: 'carousel', items: [item(1)] }), /2/)
  assert.throws(() => P.normalizeStepper({ category: 'sport', mode: 'carousel', cover: true, items: Array.from({ length: 10 }, (_, i) => item(i)) }), /10/)
  assert.equal(P.buildSlides({ category: 'sport', mode: 'carousel', cover: false, items: Array.from({ length: 10 }, (_, i) => item(i)) }).length, 10)
})
test('designFor matches buildSlides and renders', () => {
  const st = { category: 'health', mode: 'carousel', cover: true, templateId: T.TEMPLATES[0].id, size: '4:5', items: [item(1), item(2)] }
  const s = P.buildSlides(st)
  assert.equal(P.designFor(st, null).headline, s[0].headline)
  assert.equal(P.designFor(st, st.items[1]).headline, s[2].headline)
  const png = T.renderDesign({ ...s[1], category: s[1].category }, 200)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
})
test('planPublish groups by platform image limits', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const r = P.planPublish([{ id: 1, provider: 'instagram' }, { id: 2, provider: 'facebook' }, { id: 3, provider: 'x' }, { id: 4, provider: 'tiktok' }, { id: 5, provider: 'linkedin' }], ids)
  assert.equal(r.posts.length, 2)
  assert.deepEqual(r.posts[0], { mediaIds: ids, accountIds: [1, 2, 5] })
  assert.deepEqual(r.posts[1], { mediaIds: ['a', 'b', 'c', 'd'], accountIds: [3] })
  assert.deepEqual(r.skipped, [4]); assert.equal(r.warnings.length, 2)
  assert.equal(P.planPublish([{ id: 1, provider: 'x' }], ['a']).warnings.length, 0)
})
test('makeZip produces a valid stored zip', () => {
  const z = P.makeZip([{ name: 'a.png', data: Buffer.from('hello') }, { name: 'b.png', data: Buffer.from('world!') }])
  assert.equal(z.readUInt32LE(0), 0x04034b50)
  assert.equal(z.readUInt32LE(14), P.crc32(Buffer.from('hello')))
  assert.equal(P.crc32(Buffer.from('123456789')), 0xCBF43926)
  const eocd = z.length - 22; assert.equal(z.readUInt32LE(eocd), 0x06054b50); assert.equal(z.readUInt16LE(eocd + 10), 2)
  assert.ok(inflateRawSync)
})
