import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runFfmpeg } from '../server/lib/video/ffmpeg.js'
import * as T from '../server/lib/video/tts.js'
import * as R from '../server/lib/video/reel.js'

test('speech text cleaning: urls, emoji, sources, numbers, currencies, dates, punctuation', () => {
  assert.equal(T.cleanForSpeech('الذهب يتراجع إلى 3,150 ج.م (رويترز) 📉 https://x.com/a'), 'الذهب يتراجع إلى 3150 جنيه.')
  assert.equal(T.cleanForSpeech('نمو ٤٫٢٪ في 26/10/2026 - اليوم السابع'), 'نمو 4.2 بالمئة في 26 أكتوبر 2026.')
  assert.equal(T.cleanForSpeech('«الكل» يكتسح #السوشيال_ميديا'), 'الكل يكتسح السوشيال ميديا.')
  assert.equal(T.cleanForSpeech('سعر الدولار $48.5 اليوم?'), 'سعر الدولار 48.5 دولار اليوم؟')
  assert.equal(T.cleanForSpeech('  '), '')
  const ssml = T.buildSsml('أ & ب <x>', 'bad-voice')
  assert.match(ssml, /voice name="ar-EG-ShakirNeural"/); assert.match(ssml, /rate="-7%"/); assert.ok(!ssml.includes('<x>') && !ssml.includes('<break'))
  assert.equal(T.voiceId('ar-EG-SalmaNeural'), 'ar-EG-SalmaNeural')
})

async function mockProvider (calls, seconds = 2) {
  return async ({ ssml, outDir }) => {
    calls.push(ssml)
    const f = join(outDir, 'a.wav')
    await runFfmpeg(['-f', 'lavfi', '-i', `sine=f=220:d=${seconds}`, '-ar', '24000', f])
    return f
  }
}

test('synthesize: mocked provider, per-part cache, gap between parts, fallback on failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tts-'))
  const calls = []
  T.setTtsProvider(await mockProvider(calls))
  try {
    const a = await T.synthesize(['عنوان الخبر', 'التفاصيل'], 'ar-EG-ShakirNeural', { cacheDir: dir })
    assert.ok(existsSync(a.file)); assert.ok(a.duration > 4.2 && a.duration < 4.8, String(a.duration)) // 2 + 0.45 + 2
    assert.equal(calls.length, 2)
    await T.synthesize(['عنوان الخبر', 'التفاصيل'], 'ar-EG-ShakirNeural', { cacheDir: dir })
    assert.equal(calls.length, 2) // cached
    await T.synthesize(['عنوان الخبر'], 'ar-SA-ZariyahNeural', { cacheDir: dir })
    assert.equal(calls.length, 3) // other voice → new audio
    T.setTtsProvider(async () => { throw new Error('offline') })
    await assert.rejects(T.synthesize(['نص جديد'], 'ar-SA-HamedNeural', { cacheDir: dir }), /offline/)
  } finally { T.setTtsProvider(null); await rm(dir, { recursive: true, force: true }) }
})

test('reel voice-over: spec default on, durations stretch to speech, cues, 3-minute cap', async () => {
  const s = R.normalizeReelSpec({ items: [{ file: 'a.jpg', title: 'عنوان', body: 'تفاصيل', duration: 4 }, { file: 'b.jpg', title: 'تاني', duration: 9 }] }, { allowFiles: true })
  assert.deepEqual(s.voice, { enabled: true, name: 'ar-EG-ShakirNeural', intro: true })
  assert.equal(R.normalizeReelSpec({ items: [{ file: 'a.jpg', title: 't' }], voice: { enabled: false } }, { allowFiles: true }).voice.enabled, false)
  const synth = async (parts) => ({ file: 'x.wav', duration: parts.length * 3 })
  const v = await R.prepareVoice(s, { synth })
  assert.equal(v.spec.items[0].duration, +(R.VOICE.lead + 6 + R.VOICE.tail).toFixed(2)) // 4s → stretched for title+body
  assert.equal(v.spec.items[1].duration, 9) // already long enough
  assert.ok(v.spec.introDuration >= R.REEL.intro)
  const tl = R.reelTimeline(v.spec); const cues = R.voiceCues(v, tl)
  assert.equal(cues.length, 3); assert.equal(cues[0].t, R.VOICE.introAt)
  tl.segments.filter(x => x.kind === 'item').forEach((sg, k) => { const c = cues[k + 1]; assert.ok(c.t + c.duration <= sg.start + sg.duration - 0.5, 'voice ends before the next transition') })
  // Too long with bodies → drop bodies; still too long → 400 error
  const many = R.normalizeReelSpec({ items: Array.from({ length: 15 }, (_, i) => ({ file: `${i}.jpg`, title: 'ع', body: 'ت', duration: 3 })) }, { allowFiles: true })
  const v2 = await R.prepareVoice(many, { synth: async parts => ({ file: 'x', duration: parts.length === 2 ? 12 : 8 }) })
  assert.equal(v2.bodies, false); assert.ok(R.reelTimeline(v2.spec).total <= 180)
  await assert.rejects(R.prepareVoice(many, { synth: async () => ({ file: 'x', duration: 15 }) }), e => e.statusCode === 400)
})
