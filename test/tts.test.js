import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runFfmpeg } from '../server/lib/video/ffmpeg.js'
import * as T from '../server/lib/video/tts.js'
import * as R from '../server/lib/video/reel.js'

delete process.env.GEMINI_API_KEY // hermetic: no real Gemini calls in tests (Gemini is mocked where needed)

test('speech text cleaning: urls, emoji, sources, numbers, currencies, dates, punctuation', () => {
  assert.equal(T.cleanForSpeech('الذهب يتراجع إلى 3,150 ج.م (رويترز) 📉 https://x.com/a'), 'الذهب يتراجع إلى 3150 جنيه.')
  assert.equal(T.cleanForSpeech('نمو ٤٫٢٪ في 26/10/2026 - اليوم السابع'), 'نمو 4.2 بالمئة في 26 أكتوبر 2026.')
  assert.equal(T.cleanForSpeech('«الكل» يكتسح #السوشيال_ميديا'), 'الكل يكتسح السوشيال ميديا.')
  assert.equal(T.cleanForSpeech('سعر الدولار $48.5 اليوم?'), 'سعر الدولار 48.5 دولار اليوم؟')
  assert.equal(T.cleanForSpeech('  '), '')
  const ssml = T.buildSsml('أ & ب <x>', 'bad-voice')
  assert.match(ssml, /voice name="ar-EG-ShakirNeural"/); assert.match(ssml, /rate="-7%"/); assert.ok(!ssml.includes('<x>') && !ssml.includes('<break'))
  for (const bad of ['ar-EG-SalmaNeural', 'gemini:Charon', '', undefined, '../x']) assert.equal(T.voiceId(bad), 'gemini:ar-eg-podcaster-1') // one fixed voice, whatever is requested
  assert.equal(T.DEFAULT_VOICE, T.FIXED_VOICE); assert.equal(T.EDGE_FALLBACK_VOICE, 'ar-EG-ShakirNeural')
})

async function mockProvider (calls, seconds = 2) {
  return async ({ ssml, outDir }) => {
    calls.push(ssml)
    const f = join(outDir, 'a.wav')
    await runFfmpeg(['-f', 'lavfi', '-i', `sine=f=220:d=${seconds}`, '-ar', '24000', f])
    return f
  }
}

test('synthesize (Edge last resort, no Gemini key): per-part cache, gap between parts, voice arg ignored, failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tts-'))
  const calls = []
  T.setTtsProvider(await mockProvider(calls))
  try {
    const a = await T.synthesize(['عنوان الخبر', 'التفاصيل'], 'ar-EG-ShakirNeural', { cacheDir: dir })
    assert.ok(existsSync(a.file)); assert.ok(a.duration > 4.2 && a.duration < 4.8, String(a.duration)) // 2 + 0.45 + 2
    assert.equal(calls.length, 2)
    await T.synthesize(['عنوان الخبر', 'التفاصيل'], 'ar-EG-ShakirNeural', { cacheDir: dir })
    assert.equal(calls.length, 2) // cached
    assert.equal(a.provider, 'edge'); assert.equal(a.voice, 'ar-EG-ShakirNeural'); assert.match(a.fallbackReason, /GEMINI_API_KEY/)
    await T.synthesize(['عنوان الخبر', 'التفاصيل'], 'ar-SA-ZariyahNeural', { cacheDir: dir })
    assert.equal(calls.length, 2) // requested voice is ignored → same fixed fallback voice → cached
    assert.ok(calls.every(c => c.includes('ar-EG-ShakirNeural')))
    await assert.rejects(T.synthesize(['عنوان'], 'x', { cacheDir: dir, fallback: false }), /not enabled/)
    T.setTtsProvider(async () => { throw new Error('offline') })
    await assert.rejects(T.synthesize(['نص جديد'], 'ar-SA-HamedNeural', { cacheDir: dir }), /offline/)
  } finally { T.setTtsProvider(null); await rm(dir, { recursive: true, force: true }) }
})

test('reel voice-over: no spoken intro, each item lasts exactly its speech + short tail, cues, 3-minute cap', async () => {
  const s = R.normalizeReelSpec({ items: [{ file: 'a.jpg', title: 'عنوان', body: 'تفاصيل', duration: 4 }, { file: 'b.jpg', title: 'تاني', duration: 9 }] }, { allowFiles: true })
  assert.deepEqual(s.voice, { enabled: true, name: 'gemini:ar-eg-podcaster-1' }) // no voice.intro any more
  assert.equal(R.normalizeReelSpec({ items: [{ file: 'a.jpg', title: 't' }], voice: { name: 'ar-SA-HamedNeural', intro: true } }, { allowFiles: true }).voice.intro, undefined) // old drafts can't re-enable it
  assert.equal(R.normalizeReelSpec({ items: [{ file: 'a.jpg', title: 't' }], voice: { enabled: false } }, { allowFiles: true }).voice.enabled, false)
  const spoken = []
  const synth = async (parts) => { spoken.push(parts); return { file: 'x.wav', duration: parts.length * 3 } }
  const v = await R.prepareVoice(s, { synth })
  assert.equal(v.intro, null); assert.equal(spoken.length, 2) // only the items are synthesized: nothing like "الكل <فئة>"
  assert.deepEqual(spoken[0], ['عنوان', 'تفاصيل']); assert.deepEqual(spoken[1], ['تاني']) // headline + description are read
  assert.ok(!spoken.flat().some(x => /الكل/.test(x)))
  assert.equal(v.spec.items[0].duration, +(R.VOICE.lead + 6 + R.VOICE.tail).toFixed(2)) // manual 4s ignored: exactly speech + lead + tail
  assert.equal(v.spec.items[1].duration, +(R.VOICE.lead + 3 + R.VOICE.tail).toFixed(2)) // manual 9s ignored too: no fixed minimum
  assert.ok(R.VOICE.tail >= 0.4 && R.VOICE.tail <= 0.6)
  assert.equal(v.spec.introDuration, undefined); assert.equal(R.reelTimeline(v.spec).segments[0].duration, R.REEL.intro) // fixed short intro
  const tl = R.reelTimeline(v.spec); const cues = R.voiceCues(v, tl)
  assert.equal(cues.length, 2); assert.ok(cues[0].t >= tl.segments[1].start) // nothing is spoken over the intro
  tl.segments.filter(x => x.kind === 'item').forEach((sg, k) => { const c = cues[k]; assert.ok(Math.abs(c.t + c.duration + R.VOICE.tail - (sg.start + sg.duration)) < 0.01, 'next item starts right after the speech ends'); assert.ok(c.t + c.duration <= sg.start + sg.duration - R.REEL.transition + 0.01) })
  // Too long with descriptions → drop them from the speech; still too long → 400 error
  const many = R.normalizeReelSpec({ items: Array.from({ length: 15 }, (_, i) => ({ file: `${i}.jpg`, title: 'ع', body: 'ت' })) }, { allowFiles: true })
  const v2 = await R.prepareVoice(many, { synth: async parts => ({ file: 'x', duration: parts.length === 2 ? 12 : 8 }) })
  assert.equal(v2.bodies, false); assert.ok(R.reelTimeline(v2.spec).total <= 180)
  await assert.rejects(R.prepareVoice(many, { synth: async () => ({ file: 'x', duration: 15 }) }), e => e.statusCode === 400)
})

// ---- Gemini provider (mocked: no network, no key, no quota) ----
const FIXED = 'gemini:ar-eg-podcaster-1'
async function toneBuffer (seconds, pcm = false) {
  const d = await mkdtemp(join(tmpdir(), 'tone-'))
  const f = join(d, pcm ? 't.pcm' : 't.wav')
  await runFfmpeg(['-f', 'lavfi', '-i', `sine=f=300:d=${seconds}`, '-ar', '24000', '-ac', '1', ...(pcm ? ['-f', 's16le'] : []), f])
  const b = await readFile(f); await rm(d, { recursive: true, force: true }); return b
}
const gemEnv = () => { const keep = { i: process.env.GEMINI_TTS_MIN_INTERVAL_MS, m: process.env.GEMINI_TTS_MODELS }; process.env.GEMINI_TTS_MIN_INTERVAL_MS = '0'; delete process.env.GEMINI_TTS_MODELS; T.resetGeminiState(); return () => { for (const [k, v] of [['GEMINI_TTS_MIN_INTERVAL_MS', keep.i], ['GEMINI_TTS_MODELS', keep.m]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v }; T.setGeminiProvider(null); T.setTtsProvider(null); T.resetGeminiState() } }

test('gemini styles per category + default model chain keeps the same voice on every model', () => {
  for (const c of ['sport', 'economy', 'politics', 'trend', 'health', 'breaking']) assert.match(T.voiceStyle(c), /اللهجة المصرية/)
  assert.notEqual(T.voiceStyle('sport'), T.voiceStyle('health')); assert.notEqual(T.voiceStyle('breaking'), T.voiceStyle('trend')); assert.equal(T.voiceStyle('nope'), T.GEMINI_STYLES.default)
  const off = gemEnv()
  try { assert.deepEqual(T.geminiModels().map(m => m.id), ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts:generate']) } finally { off() }
})

test('gemini synthesize: one request per clip, fixed voice + style + text sent, cache, WAV and raw PCM, retry on per-minute 429', async () => {
  const off = gemEnv(); const dir = await mkdtemp(join(tmpdir(), 'tts-g-'))
  const calls = []; let fail429 = 1
  const wav = await toneBuffer(2); const pcm = await toneBuffer(1.5, true)
  T.setGeminiProvider(async c => { calls.push(c); if (c.text.includes('ثقيل') && fail429-- > 0) throw Object.assign(new Error('rpm'), { status: 429, retryAfter: 0 }); return c.text.includes('خام') ? { data: pcm, mime: 'audio/L16;codec=pcm;rate=24000' } : { data: wav, mime: 'audio/wav' } })
  try {
    const style = T.voiceStyle('sport')
    const a = await T.synthesize(['عنوان الخبر', 'التفاصيل'], 'ar-SA-HamedNeural', { cacheDir: dir, style }) // requested voice is ignored
    assert.equal(a.provider, 'gemini'); assert.equal(a.voice, FIXED); assert.ok(a.duration > 1.5 && a.duration < 2.3, String(a.duration)) // 2s tone, silence trimmed, 48k stereo
    assert.equal(calls.length, 1); assert.equal(calls[0].style, style); assert.equal(calls[0].voice, FIXED); assert.equal(calls[0].model, 'gemini-3.8-flash-tts'); assert.equal(calls[0].generate, false)
    assert.ok(calls[0].text.includes('عنوان الخبر') && calls[0].text.includes('التفاصيل'))
    await T.synthesize(['عنوان الخبر', 'التفاصيل'], FIXED, { cacheDir: dir, style }); assert.equal(calls.length, 1) // cached
    await T.synthesize(['عنوان الخبر', 'التفاصيل'], FIXED, { cacheDir: dir, style: T.voiceStyle('health') }); assert.equal(calls.length, 2) // other style
    const p = await T.synthesize(['نص خام'], FIXED, { cacheDir: dir }); assert.ok(p.duration > 1.0 && p.duration < 1.8, String(p.duration)); assert.equal(p.provider, 'gemini')
    const r = await T.synthesize(['نص ثقيل'], FIXED, { cacheDir: dir }); assert.equal(r.provider, 'gemini'); assert.equal(calls.filter(c => c.text.includes('ثقيل')).length, 2) // 429 → retried on same model
  } finally { off(); await rm(dir, { recursive: true, force: true }) }
})

test('gemini fallbacks: daily quota → next model with the same voice (stays blocked) → Edge Shakir → error only if Edge fails too', async () => {
  const off = gemEnv(); const dir = await mkdtemp(join(tmpdir(), 'tts-g-'))
  const wav = await toneBuffer(1.2); const calls = []
  let mode = 'first-daily'
  T.setGeminiProvider(async c => {
    calls.push(c)
    if (mode === 'first-daily' && c.model === 'gemini-3.8-flash-tts' && !c.generate) throw Object.assign(new Error('Gemini 429: limit: 10 requests per day'), { status: 429, retryAfter: 80000, daily: true })
    if (mode === 'all-down') throw Object.assign(new Error('Gemini 429: limit: 10 requests per day'), { status: 429, retryAfter: 80000, daily: true })
    return { data: wav, mime: 'audio/wav' }
  })
  try {
    const a = await T.synthesize(['خبر أول'], FIXED, { cacheDir: dir }); assert.equal(a.provider, 'gemini')
    assert.deepEqual(calls.map(c => c.model + (c.generate ? ':g' : '')), ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'])
    assert.ok(calls.every(c => c.voice === FIXED)) // same voice on every model
    await T.synthesize(['خبر ثان'], FIXED, { cacheDir: dir })
    assert.equal(calls.length, 3); assert.equal(calls[2].model, 'gemini-3.8-flash-lite-tts') // exhausted model is skipped, no wasted request
    // the generateContent entry is part of the chain and also gets the fixed voice
    process.env.GEMINI_TTS_MODELS = 'gemini-3.8-flash-tts:generate'; T.resetGeminiState(); mode = 'ok'
    await T.synthesize(['خبر ثالث'], FIXED, { cacheDir: dir }); assert.equal(calls.at(-1).generate, true); assert.equal(calls.at(-1).voice, FIXED)
    delete process.env.GEMINI_TTS_MODELS; T.resetGeminiState(); mode = 'all-down'
    const edgeCalls = []; T.setTtsProvider(await mockProvider(edgeCalls, 1.5))
    const e = await T.synthesize(['خبر رابع'], FIXED, { cacheDir: dir })
    assert.equal(e.provider, 'edge'); assert.equal(e.voice, 'ar-EG-ShakirNeural'); assert.match(e.fallbackReason, /per day/); assert.equal(edgeCalls.length, 1)
    await assert.rejects(T.synthesize(['خبر خامس'], FIXED, { cacheDir: dir, fallback: false }), /429|quota/)
    T.setTtsProvider(async () => { throw new Error('offline') })
    await assert.rejects(T.synthesize(['خبر سادس'], FIXED, { cacheDir: dir }), /offline/) // both down → renderReel falls back to music-only
  } finally { off(); await rm(dir, { recursive: true, force: true }) }
})

test('reel voice-over: category style is passed to the synthesizer, Gemini→Edge fallback is reported', async () => {
  const s = R.normalizeReelSpec({ category: 'breaking', voice: { name: 'whatever' }, items: [{ file: 'a.jpg', title: 'عنوان', body: 'تفاصيل', duration: 4 }] }, { allowFiles: true })
  assert.equal(s.voice.name, FIXED)
  const seen = []
  const v = await R.prepareVoice(s, { synth: async (parts, voice, o) => { seen.push([voice, o?.style]); return { file: 'x.wav', duration: 3, provider: 'gemini' } } })
  assert.ok(seen.length === 1 && seen.every(([vo, st]) => vo === FIXED && st === T.voiceStyle('breaking'))); assert.equal(v.fellBack, '')
  const f = await R.prepareVoice(s, { synth: async () => ({ file: 'x.wav', duration: 3, provider: 'edge', fallbackReason: 'Gemini 429: limit: 10 requests per day' }) })
  assert.match(f.fellBack, /per day/)
})
