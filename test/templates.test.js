import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const { fitText, isRtlText } = await import('../server/templates/lib/svg.js')
const T = await import('../server/templates/index.js')

test('isRtlText detects Arabic', () => { assert.equal(isRtlText('مرحبا world'), true); assert.equal(isRtlText('hello'), false) })
test('fitText shrinks long text to fit lines', () => {
  const f = fitText({ text: 'كلمة '.repeat(60), width: 500, size: 80, minSize: 20, maxLines: 4, font: 'plex', weight: 700, lh: 1.2 })
  assert.ok(f.lines.length <= 4); assert.ok(f.size < 80)
})
test('every template renders for every size and language', () => {
  for (const t of T.TEMPLATES) for (const size of ['4:5', '1:1', '9:16', '16:9']) for (const lang of ['ar', 'en']) {
    const cat = t.categories === '*' ? 'sport' : t.categories[0]
    const png = T.renderDesign({ templateId: t.id, category: cat, size, lang, headline: lang === 'ar' ? 'عنوان تجريبي طويل نسبيا للاختبار' : 'A fairly long test headline', subtitle: 'sub', stat: { value: '42%', label: 'x' } }, 200)
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${t.id} ${size} ${lang}`)
  }
})
test('overlayPng renders', () => {
  const png = T.overlayPng({ width: 1080, height: 1920, text: 'نص', category: 'breaking', lang: 'ar', brand: {} })
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
})
test('templates without a photo are all visually distinct', async () => {
  const { createHash } = await import('node:crypto')
  const h = T.TEMPLATES.map(t => createHash('md5').update(T.renderDesign({ templateId: t.id, category: 'politics-economy', size: '4:5', lang: 'ar', headline: 'اختبار اختبار اختبار', date: 'x' }, 200)).digest('hex'))
  assert.equal(new Set(h).size, T.TEMPLATES.length)
})
test('built-in presets reference valid templates, categories and starter photos', async () => {
  const { BUILTIN_PRESETS, STARTER_PHOTOS } = await import('../server/templates/presets.js')
  const { existsSync } = await import('node:fs')
  assert.equal(BUILTIN_PRESETS.length, 7)
  assert.ok(BUILTIN_PRESETS.every(p => p.kind === 'poster' && p.data.lang === 'ar'))
  const used = new Set(BUILTIN_PRESETS.map(p => p.data.starterPhoto).filter(Boolean))
  assert.deepEqual(Object.keys(STARTER_PHOTOS).sort(), [...used].sort())
  for (const p of BUILTIN_PRESETS) {
    assert.ok(T.TEMPLATES.some(t => t.id === p.data.templateId), p.id)
    assert.ok(T.CATEGORIES[p.data.category], p.id)
    assert.ok(existsSync('public' + p.thumb), p.thumb)
    if (p.data.starterPhoto) assert.ok(existsSync('assets/presets/photos/' + STARTER_PHOTOS[p.data.starterPhoto].file))
  }
})

test('each gallery filter chip returns exactly the expected built-in presets', async () => {
  const { BUILTIN_PRESETS } = await import('../server/templates/presets.js')
  const { filterPresets } = await import('../utils/presets.js')
  const expected = { sport: 2, 'politics-economy': 2, medical: 1, trend: 1, breaking: 1, quote: 1 }
  for (const [cat, n] of Object.entries(expected)) assert.equal(filterPresets(BUILTIN_PRESETS, { category: cat }).length, n, cat)
  const all = filterPresets(BUILTIN_PRESETS, {}); assert.equal(all.length, 7); assert.equal(new Set(all.map(p => p.id)).size, 7)
  assert.deepEqual(filterPresets(BUILTIN_PRESETS, { category: 'politics-economy' }).map(p => p.id).sort(), ['builtin:ar-breaking', 'builtin:ar-politics-split'])
  assert.equal(filterPresets(BUILTIN_PRESETS, { category: 'breaking' })[0].data.category, 'breaking')
  // Backward compatible: user preset with only `category`.
  assert.equal(filterPresets([{ id: 'u1', data: { category: 'medical' } }], { category: 'medical' }).length, 1)
  const q = filterPresets(BUILTIN_PRESETS, { category: 'quote' })[0]
  assert.equal(q.data.templateId, 'quote'); assert.equal(T.CATEGORIES[q.data.category].accent, '#E8A317')
  assert.equal(filterPresets(BUILTIN_PRESETS, { category: 'breaking' })[0].data.templateId, 'breaking')
  for (const p of BUILTIN_PRESETS) { const t = T.TEMPLATES.find(t => t.id === p.data.templateId); assert.ok(t.categories === '*' || t.categories.includes(p.data.category), p.id) }
})
test('breaking banner renders big badge in AR and EN', async () => {
  const { breakingBanner } = await import('../server/templates/layouts.js')
  const ar = breakingBanner({ rtl: true, x: 0, y: 0, width: 900, size: 96, font: 'plex' })
  const en = breakingBanner({ rtl: false, x: 0, y: 0, width: 900, size: 96, font: 'plex' })
  assert.ok(ar.svg.includes('عاجل') && en.svg.includes('BREAKING'))
  assert.ok(ar.height > 140 && en.width > ar.width)
})
