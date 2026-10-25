import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const B = await import('../server/templates/brand/alkol.js')
const T = await import('../server/templates/index.js')

test('alkol: every category lights exactly one square at the fixed top-right position; colours are distinct', () => {
  const cats = Object.values(B.BRAND_CATEGORIES)
  for (const c of cats) assert.deepEqual(c.squares, [1])
  const colors = cats.filter(c => c.color).map(c => c.color)
  assert.equal(new Set(colors).size, colors.length)
  assert.equal(B.BRAND_CATEGORIES.breaking.color, '#FF1F1F')
})
test('alkol: project categories map to brand categories', () => {
  for (const c of Object.keys(T.CATEGORIES)) assert.ok(B.BRAND_CATEGORIES[B.brandCategory(c)], c)
  assert.equal(B.brandCategory('medical'), 'health'); assert.equal(B.brandCategory('politics-economy'), 'politics'); assert.equal(B.brandCategory('quote'), 'neutral')
})
test('alkol: icon/lockup/watermark render to PNG', () => {
  for (const c of ['sport', 'economy', 'breaking', 'quote']) {
    for (const svg of [B.iconSvg(c), B.lockupSvg(c, { dark: false, background: true }), `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">${B.watermark(c, { x: 390, y: 10 }).svg}</svg>`]) {
      assert.equal(T.svgToPng(svg).subarray(1, 4).toString(), 'PNG', c)
    }
  }
  assert.match(B.lockup('sport').svg, /رياضة/); assert.match(B.lockup('sport').svg, /الكل/)
})
test('alkol: mark shows on posters by default and can be turned off', () => {
  const o = { templateId: 'type-only', category: 'sport', size: '4:5', lang: 'ar', headline: 'عنوان' }
  assert.match(T.designSvg(o), /الكل/)
  assert.doesNotMatch(T.designSvg({ ...o, brand: { showMark: false } }), /الكل/)
})
