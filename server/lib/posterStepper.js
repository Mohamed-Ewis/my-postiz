// Poster stepper helpers: category mapping, slide building, platform media limits, publish grouping, tiny ZIP writer.
// Pure functions (no DB) so they can be unit-tested.
export const STEPPER_CATS = {
  sport: { label: 'رياضة', color: '#00C853', poster: 'sport' },
  economy: { label: 'اقتصاد', color: '#FFB300', poster: 'politics-economy' },
  politics: { label: 'سياسة', color: '#2F6BFF', poster: 'politics-economy' },
  trend: { label: 'ترند', color: '#FF2D87', poster: 'trend' },
  health: { label: 'صحة', color: '#00BFA5', poster: 'medical' },
  breaking: { label: 'عاجل', color: '#FF1F1F', poster: 'breaking' }
}
export const MODES = ['single', 'carousel']
export const CAROUSEL_MIN = 2
export const CAROUSEL_MAX = 10 // Instagram carousel limit (cover counts as a slide)

// How many images each provider can take in one post. 0 = images not supported.
export const PROVIDER_IMAGE_LIMIT = { instagram: 10, facebook: 10, linkedin: 9, x: 4, mock: 10, tiktok: 0, youtube: 0 }

const str = (v, n) => String(v ?? '').trim().slice(0, n)

/** Validate and normalise the stepper state coming from the client. Throws a 400-style Error on bad input. */
export function normalizeStepper (b = {}) {
  const category = STEPPER_CATS[b.category] ? b.category : null
  if (!category) throw Object.assign(new Error('اختار الفئة'), { statusCode: 400 })
  const mode = MODES.includes(b.mode) ? b.mode : 'single'
  const items = (Array.isArray(b.items) ? b.items : []).map(it => ({
    headline: str(it.headline ?? it.title, 300), subtitle: str(it.subtitle ?? it.body, 400), source: str(it.source, 80),
    mediaId: it.mediaId || null, focus: it.focus ? { x: Number(it.focus.x ?? 0.5), y: Number(it.focus.y ?? 0.4) } : undefined,
    stat: it.stat?.value ? { value: str(it.stat.value, 12), label: str(it.stat.label, 80) } : null
  })).filter(it => it.headline)
  if (!items.length) throw Object.assign(new Error('محتاج خبر واحد على الأقل بعنوان'), { statusCode: 400 })
  const cover = mode === 'carousel' && !!b.cover
  if (mode === 'single' && items.length !== 1) throw Object.assign(new Error('البوستر الواحد = خبر واحد بس'), { statusCode: 400 })
  if (mode === 'carousel') {
    if (items.length < CAROUSEL_MIN) throw Object.assign(new Error(`الكاروسيل محتاج ${CAROUSEL_MIN} أخبار على الأقل`), { statusCode: 400 })
    if (items.length + (cover ? 1 : 0) > CAROUSEL_MAX) throw Object.assign(new Error(`أقصى حاجة ${CAROUSEL_MAX} شرائح في الكاروسيل${cover ? ' (مع الغلاف)' : ''}`), { statusCode: 400 })
  }
  return { category, mode, cover, items, templateId: str(b.templateId, 60), size: ['4:5', '1:1', '9:16'].includes(b.size) ? b.size : '4:5', font: b.font || undefined, lang: 'ar' }
}

/** Design inputs (for renderPoster/exportPoster), one per slide, all sharing the same template/size/colour. */
export function buildSlides (state) {
  const s = normalizeStepper(state)
  const c = STEPPER_CATS[s.category]
  const base = { templateId: s.templateId, category: c.poster, size: s.size, lang: 'ar', accent: c.color, font: s.font }
  const slides = s.items.map(it => ({ ...base, ...it }))
  if (s.cover) slides.unshift({ ...base, headline: `الكل | ${c.label}`, subtitle: `${s.items.length} أخبار — اسحب ←`, mediaId: s.items.find(i => i.mediaId)?.mediaId || null, stat: null, source: '' })
  return slides
}

/** Group target accounts by how many images they can take. Returns posts to create plus warnings. */
export function planPublish (accounts, mediaIds) {
  const groups = new Map(); const warnings = []; const skipped = []
  for (const a of accounts) {
    const lim = PROVIDER_IMAGE_LIMIT[a.provider] ?? 1
    if (!lim) { skipped.push(a.id); warnings.push(`${a.name || a.provider}: المنصة دي فيديو بس — اتشالت من النشر`); continue }
    const ids = mediaIds.slice(0, lim)
    if (ids.length < mediaIds.length) warnings.push(`${a.name || a.provider}: بتقبل ${lim} صور بس — هيتنشر أول ${lim}`)
    const k = ids.join(',')
    if (!groups.has(k)) groups.set(k, { mediaIds: ids, accountIds: [] })
    groups.get(k).accountIds.push(a.id)
  }
  return { posts: [...groups.values()], warnings, skipped }
}

// ---- minimal ZIP (store, no compression) — PNG/JPEG are already compressed.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export function crc32 (buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
export function makeZip (files) {
  const parts = []; const central = []; let off = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const data = Buffer.from(f.data); const crc = crc32(data)
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8)
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28)
    parts.push(h, name, data)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10)
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28)
    c.writeUInt32LE(off, 42); central.push(c, name)
    off += 30 + name.length + data.length
  }
  const cd = Buffer.concat(central); const e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16)
  return Buffer.concat([...parts, cd, e])
}

/** Design input for one item (or the cover when item is null) — used by the client's live previews. */
export function designFor (state, item) {
  const c = STEPPER_CATS[state.category] || STEPPER_CATS.trend
  const base = { templateId: state.templateId, category: c.poster, size: state.size || '4:5', lang: 'ar', accent: c.color, font: state.font || undefined }
  if (!item) return { ...base, headline: `الكل | ${c.label}`, subtitle: `${(state.items || []).length} أخبار — اسحب ←`, mediaId: (state.items || []).find(i => i.mediaId)?.mediaId || null }
  return { ...base, headline: item.headline || '', subtitle: item.subtitle || '', source: item.source || '', mediaId: item.mediaId || null, focus: item.focus, stat: item.stat?.value ? item.stat : null }
}
