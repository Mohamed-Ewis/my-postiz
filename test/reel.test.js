import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync, readFileSync } from 'node:fs'

const R = await import('../server/lib/video/reel.js')
const { svgToPng } = await import('../server/templates/index.js')
const items = n => Array.from({ length: n }, (_, i) => ({ mediaId: `m${i}`, title: `خبر رقم ${i + 1}`, body: 'نص', duration: 8 }))

test('reel spec: validation, defaults, category swap, 3-minute cap', () => {
  const s = R.normalizeReelSpec({ category: 'medical', items: [...items(2), { title: 'no image' }, { mediaId: 'x' }, { mediaId: 'y', title: 't', duration: 99 }] })
  assert.equal(s.template, 'news-reel'); assert.equal(s.category, 'health'); assert.equal(s.items.length, 3)
  assert.equal(s.items[2].duration, R.REEL.itemMax); assert.equal(s.handle, '@alkol'); assert.equal(s.sfx, true); assert.equal(s.categoryMusic, true)
  assert.equal(R.normalizeReelSpec({ items: items(1) }).category, 'sport')
  assert.equal(R.normalizeReelSpec({ items: [{ file: '/etc/passwd', title: 'x' }] , category: 'sport' }, { allowFiles: true }).items[0].file, '/etc/passwd')
  assert.throws(() => R.normalizeReelSpec({ items: [{ file: '/etc/passwd', title: 'x' }] }), /خبر/) // files only for server-side callers
  assert.throws(() => R.normalizeReelSpec({ items: [] }), /خبر/)
  assert.throws(() => R.normalizeReelSpec({ items: Array.from({ length: 12 }, (_, i) => ({ mediaId: 'm' + i, title: 't', duration: 20 })) }), /دقايق/)
})

test('automatic duration without voice-over: from headline word count, explicit value still honored', () => {
  const mk = (title, duration) => R.normalizeReelSpec({ items: [{ file: 'a.jpg', title, duration }] }, { allowFiles: true }).items[0].duration
  assert.equal(R.autoDuration(''), 3.5); assert.equal(R.autoDuration('كلمتين فقط'), 3.5); assert.equal(R.autoDuration('كلمة '.repeat(8)), 5.6); assert.equal(R.autoDuration('كلمة '.repeat(60)), 10)
  assert.equal(mk('كلمة '.repeat(8)), 5.6); assert.equal(mk('كلمة '.repeat(8), ''), 5.6); assert.equal(mk('كلمة '.repeat(8), 12), 12) // manual override only when explicitly given
  assert.ok(mk('كلمة '.repeat(3)) < mk('كلمة '.repeat(12)))
})

test('reel timeline: intro → items → outro with overlapping transitions, HUD windows and SFX cues', () => {
  const tl = R.reelTimeline({ items: [{ duration: 9 }, { duration: 8.5 }, { duration: 8.5 }] })
  assert.deepEqual(tl.segments.map(s => [s.kind, s.start]), [['intro', 0], ['item', 2], ['item', 10.5], ['item', 18.5], ['outro', 26.5]])
  assert.equal(tl.total, 29.5)
  assert.deepEqual(tl.transitions.map(t => t.type), ['fade', 'smoothright', 'smoothright', 'fade'])
  assert.equal(tl.hud.length, 3); assert.equal(tl.hud[0].from, 2); assert.equal(tl.hud[2].to, 27)
  for (let i = 1; i < 3; i++) assert.equal(tl.hud[i].from, tl.hud[i - 1].to) // counter switches without gaps
  const names = tl.sfx.map(x => x.name)
  assert.ok(!names.includes('whoosh')) // no whooshes at all
  assert.ok(!names.includes('tick'))
  assert.ok(tl.sfx.filter(x => x.t > 2.5 && x.t < tl.segments.at(-1).start).length === 0)
  assert.ok(names.includes('hit') && names.includes('chime') && names.includes('pop'))
  assert.ok(tl.sfx.every(x => x.t >= 0 && x.t < tl.total))
})

test('reel graphics render (intro/item/hud/outro) for every category; RTL progress order', () => {
  for (const c of ['sport', 'economy', 'politics', 'trend', 'health', 'breaking']) {
    for (const svg of [R.introSvg(c, 1), R.itemSvg(c, { title: 'منتخب مصر يتأهل إلى نهائيات كأس العالم', body: '187 هدفًا' }, 2), R.hudSvg(c, 1, 3), R.outroSvg(c, 1.2)]) {
      assert.match(svg, /^<svg/); assert.equal(svgToPng(svg, 270).subarray(1, 4).toString(), 'PNG')
    }
  }
  assert.match(R.introSvg('sport', 2), /#00C853/); assert.match(R.introSvg('breaking', 2), /#FF1F1F/)
  for (const c of ['sport', 'breaking', 'health']) assert.doesNotMatch(R.introSvg(c, 2.4), /أهم أخبار|اليوم/) // logo only: no subtitle text
  assert.match(R.itemSvg('sport', { title: 'عنوان' }, 0), /<rect/); assert.doesNotMatch(R.itemSvg('sport', { title: 'عنوان' }, 0), /عنوان/) // hidden at t=0
  assert.match(R.itemSvg('sport', { title: 'عنوان' }, 3), /عنوان/)
  assert.doesNotMatch(R.itemSvg('sport', { title: 'عنوان', body: 'وصف سري لا يظهر' }, 4), /وصف|سري/) // the description is never drawn
  for (const c of ['sport', 'economy', 'politics', 'trend', 'health', 'breaking']) assert.doesNotMatch(R.itemSvg(c, { title: 'عنوان', body: 'وصف سري لا يظهر' }, 5), /وصف سري/)
  const g = R.hudGeometry(3)
  assert.ok(g.segs[0].x > g.segs[1].x && g.segs[1].x > g.segs[2].x)
  const L = R.itemLayout({ title: 'عنوان طويل جدا '.repeat(8), body: 'نص '.repeat(40) })
  assert.ok(L.head.lines.length <= 4 && L.body === null && L.tagTop > 320)
})

test('reel SFX are synthesized locally', async () => {
  const f = await R.ensureSfx()
  for (const k of ['whoosh', 'hit', 'pop', 'tick', 'chime']) assert.ok(existsSync(f[k]) && statSync(f[k]).size > 1000, k)
})

test('category music bed: sport is generated, loopable WAV; other categories fall back to none', async () => {
  const M = await import('../server/lib/video/music.js')
  const f = await M.ensureBed('sport'); assert.ok(f && existsSync(f))
  const b = readFileSync(f); assert.equal(b.toString('ascii', 0, 4), 'RIFF')
  const secs = b.readUInt32LE(40) / b.readUInt32LE(28); assert.ok(secs > 30 && secs < 60, String(secs))
  // seamless loop: last and first samples are close
  const first = b.readInt16LE(44); const last = b.readInt16LE(b.length - 4); assert.ok(Math.abs(first - last) < 800)
  assert.equal(await M.ensureBed('quote'), null)
  assert.ok(R.BED_VOLUME > 0 && R.BED_VOLUME < 1)
  assert.equal(R.normalizeReelSpec({ items: [{ file: 'x.jpg', title: 't' }], categoryMusic: false }, { allowFiles: true }).categoryMusic, false)
  assert.doesNotMatch(R.hudSvg('sport', 0, 20), /fill-opacity="0.3"/) // no progress tracks
})

test('category reel templates: styles, layouts without overlap, economy stat, breaking banner, beds for all', async () => {
  const M = await import('../server/lib/video/music.js')
  const cats = ['sport', 'economy', 'politics', 'trend', 'health', 'breaking']
  for (const c of cats) {
    assert.ok(R.REEL_STYLES[c] && M.BEDS[c], c)
    const item = { title: 'عنوان طويل جدا للخبر '.repeat(5), body: 'نص '.repeat(40), stat: { value: '4.2%', dir: 'up', label: 'نمو' } }
    const L = R.itemLayout(item, { category: c })
    assert.ok(L.tagTop + L.tagH < (L.hasStat ? L.statTop : L.headTop), c)
    assert.ok(!L.hasStat || L.statTop + L.statH < L.headTop, c)
    assert.equal(L.body, null, c); assert.ok(L.headTop + L.head.height <= 1920 - 420 + 0.01, c) // headline ends at the safe-area line: no empty gap above it, no body block
    assert.ok(L.tagTop > 260, c + ' clears the watermark')
    const end = R.itemAnimEnd(item, c); assert.equal(R.itemSvg(c, item, end), R.itemSvg(c, item, end + 2), c + ' settles before hold')
  }
  assert.equal(R.itemLayout({ title: 'x', stat: { value: '1' } }, { category: 'sport' }).hasStat, false) // stat only for economy
  assert.match(R.itemSvg('economy', { title: 'x', stat: { value: '4.2%', dir: 'down' } }, 5), /#FF3B30/)
  assert.match(R.itemSvg('breaking', { title: 'x' }, 5), /عاجل/); assert.match(R.introSvg('breaking', 2.2), /عاجل/)
  assert.match(R.itemSvg('health', { title: 'x' }, 5), /fill-opacity="0.94"/) // airy card
  const s = R.normalizeReelSpec({ category: 'economy', items: [{ file: 'a.jpg', title: 't', stat: { value: ' 3,150 ', dir: 'sideways' } }] }, { allowFiles: true })
  assert.deepEqual(s.items[0].stat, { value: '3,150', dir: '', label: '' })
  for (const c of cats) { const f = await M.ensureBed(c); assert.ok(f && existsSync(f), c) }
})

test('news beds: politics & breaking are news underscores (tick pulse, timpani, riser); breaking has a one-shot sting', async () => {
  const M = await import('../server/lib/video/music.js')
  for (const c of ['politics', 'breaking']) {
    const b = M.BEDS[c]; assert.ok(b.tick > 0 && b.timp > 0 && b.riser > 0, c)
    assert.ok(b.bpm >= (c === 'breaking' ? 120 : 100), c)
    const f = await M.ensureBed(c, { force: true }); const w = readFileSync(f)
    const secs = w.readUInt32LE(40) / w.readUInt32LE(28); assert.ok(secs >= 28 && secs <= 60, `${c} ${secs}`)
  }
  assert.equal(M.BEDS.breaking.tickRate, 16)
  const st = await M.ensureSting('breaking'); assert.ok(st && existsSync(st) && statSync(st).size > 10000)
  assert.equal(await M.ensureSting('sport'), null)
})
