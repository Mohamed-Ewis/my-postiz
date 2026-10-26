// Arabic news voice-over (TTS). Default provider: Microsoft Edge neural voices (free, no key, via msedge-tts).
// Text is cleaned for natural reading (no URLs/emoji/sources, readable numbers), wrapped in SSML with a slightly
// slower rate and short pauses, cached per text+voice, then converted to WAV with tiny fades (no clipped edges).
import { mkdir, rename, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { runFfmpeg, probe } from './ffmpeg.js'

export const VOICES = [
  { id: 'ar-SA-HamedNeural', label: 'حامد — رجالي (فصحى)', gender: 'male' },
  { id: 'ar-SA-ZariyahNeural', label: 'زارية — حريمي (فصحى)', gender: 'female' },
  { id: 'ar-EG-ShakirNeural', label: 'شاكر — رجالي (مصري)', gender: 'male' },
  { id: 'ar-EG-SalmaNeural', label: 'سلمى — حريمي (مصري)', gender: 'female' }
]
export const DEFAULT_VOICE = process.env.TTS_VOICE && /^ar-[A-Z]{2}-\w+Neural$/.test(process.env.TTS_VOICE) ? process.env.TTS_VOICE : 'ar-EG-ShakirNeural'
export const TTS_RATE = process.env.TTS_RATE || '-7%'
export const voiceId = v => (/^ar-[A-Z]{2}-\w+Neural$/.test(String(v || '')) ? String(v) : DEFAULT_VOICE)
export const ttsCacheDir = () => resolve(process.cwd(), process.env.TTS_CACHE_DIR || './storage/tts-cache')

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const toLatinDigits = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))

/** Make a headline speakable: strip URLs/emoji/hashtags/source credits, spell symbols, normalise punctuation. */
export function cleanForSpeech (input) {
  let s = toLatinDigits(String(input || ''))
  s = s.replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, ' ')
    .replace(/[([{](?:[^)\]}]{0,40})[)\]}]/g, m => (/\d/.test(m) && !/[\u0600-\u06FF]{3,}\s*[)\]}]$/.test(m) ? m.slice(1, -1) : ' ')) // (رويترز) / [AFP] → drop; (2026) → keep number
    .replace(/\s[-–—|]\s*([\u0600-\u06FF ]{2,25})$/u, (m, w) => (w.trim().split(/\s+/).length <= 3 ? '' : m)) // trailing "- اليوم السابع"
    .replace(/#(\S+)/g, (_, w) => w.replace(/_/g, ' '))
    .replace(/@\w+/g, ' ')
    .replace(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g, (m, d, mo, y) => (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31 ? `${+d} ${MONTHS[mo - 1]} ${y}` : m))
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 3,150 → 3150
    .replace(/(\d)٫(\d)/g, '$1.$2')
    .replace(/\$\s?(\d[\d.]*)/g, '$1 دولار').replace(/(\d[\d.]*)\s?\$/g, '$1 دولار')
    .replace(/€\s?(\d[\d.]*)/g, '$1 يورو').replace(/(\d[\d.]*)\s?€/g, '$1 يورو')
    .replace(/£\s?(\d[\d.]*)/g, '$1 جنيه إسترليني')
    .replace(/(\d[\d.]*)\s?(?:ج\.م|ج\.?\s?م\.?|EGP)/g, '$1 جنيه')
    .replace(/(\d[\d.]*)\s?[%٪]/g, '$1 بالمئة')
    .replace(/(\d)\s?[x×]\s?(\d)/g, '$1 في $2')
    .replace(/\s&\s/g, ' و')
    .replace(/[«»"“”„'‘’`*_~^<>{}[\]\\|•·…]+/g, m => (m.includes('…') ? '، ' : ' '))
    .replace(/\.{2,}/g, '، ')
    .replace(/\s*:\s*/g, ': ').replace(/\s*[,،]\s*/g, '، ').replace(/\s*[؛;]\s*/g, '، ').replace(/\s*\?\s*/g, '؟ ')
    .replace(/\s+([.!؟،:])/g, '$1').replace(/\s{2,}/g, ' ').trim()
    .replace(/^[-–—:،.\s]+|[-–—:،\s]+$/g, '')
  if (s && !/[.!؟]$/.test(s)) s += '.'
  return s
}

const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** SSML for one sentence group. (The free Edge endpoint rejects <break>, so pauses between parts are added as silence.) */
export function buildSsml (text, voice, { rate = TTS_RATE } = {}) {
  const v = voiceId(voice); const lang = v.slice(0, 5)
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${v}"><prosody rate="${rate}" pitch="-2%">${xml(cleanForSpeech(text))}</prosody></voice></speak>`
}
export const PART_GAP = 0.45

// ---- providers (injectable for tests) ----
async function edgeProvider ({ ssml, voice, outDir }) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('TTS timeout')), 30000))
  try {
    const r = await Promise.race([tts.rawToFile(outDir, ssml), timeout])
    return r.audioFilePath
  } finally { try { tts.close() } catch {} }
}
let provider = edgeProvider
export function setTtsProvider (fn) { provider = fn || edgeProvider }

async function speakOne (text, v, rate, cacheDir) {
  const ssml = buildSsml(text, v, { rate })
  const key = createHash('sha1').update(`${v}|${rate}|${ssml}`).digest('hex').slice(0, 20)
  const wav = join(cacheDir, `${key}.wav`)
  if (existsSync(wav)) return wav
  const work = join(cacheDir, `.${key}-${process.pid}-${Date.now()}`)
  await mkdir(work, { recursive: true })
  try {
    let raw; let lastErr
    for (let i = 0; i < 2 && !raw; i++) { try { raw = await provider({ ssml, voice: v, outDir: work, text }) } catch (e) { lastErr = e } }
    if (!raw || !existsSync(raw)) throw lastErr || new Error('TTS returned no audio')
    const tmp = join(work, 'out.wav')
    // Trim leading/trailing silence, then tiny fades so nothing starts/ends clipped.
    await runFfmpeg(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,afade=t=in:d=0.03,areverse,afade=t=in:d=0.12,areverse,highpass=f=70,aresample=48000', '-ac', '2', '-c:a', 'pcm_s16le', tmp])
    await rename(tmp, wav)
    return wav
  } finally { await rm(work, { recursive: true, force: true }).catch(() => {}) }
}

/**
 * Speak parts (e.g. [title, body]) → { file: wav (48k stereo), duration }. Each part is cached separately
 * (storage/tts-cache, hash of voice+rate+SSML); parts are joined with a short breath (PART_GAP).
 */
export async function synthesize (parts, voice, { rate = TTS_RATE, cacheDir = ttsCacheDir() } = {}) {
  const v = voiceId(voice)
  const texts = [].concat(parts).map(cleanForSpeech).filter(Boolean)
  if (!texts.length) throw new Error('No text to speak')
  await mkdir(cacheDir, { recursive: true })
  const files = []
  for (const t of texts) files.push(await speakOne(t, v, rate, cacheDir))
  let out = files[0]
  if (files.length > 1) {
    const key = createHash('sha1').update(files.join('|') + PART_GAP).digest('hex').slice(0, 20)
    out = join(cacheDir, `j_${key}.wav`)
    if (!existsSync(out)) {
      const inputs = files.flatMap(f => ['-i', f])
      const pads = files.map((_, i) => i < files.length - 1 ? `[${i}:a]apad=pad_dur=${PART_GAP}[p${i}]` : `[${i}:a]anull[p${i}]`)
      const tmp = out + '.tmp.wav'
      await runFfmpeg([...inputs, '-filter_complex', `${pads.join(';')};${files.map((_, i) => `[p${i}]`).join('')}concat=n=${files.length}:v=0:a=1[a]`, '-map', '[a]', '-c:a', 'pcm_s16le', tmp])
      await rename(tmp, out)
    }
  }
  const info = await probe(out)
  if (!(info.duration > 0.2)) { await rm(out, { force: true }); throw new Error('TTS audio is empty') }
  return { file: out, duration: info.duration }
}

/** Rough speaking-time estimate (seconds) for UI/limits: ~2.3 words/s at the default rate + pauses. */
export const estimateSpeech = text => { const w = cleanForSpeech(text).split(/\s+/).filter(Boolean).length; return w ? w / 2.3 + 0.4 : 0 }

export async function clearTtsCache () { const d = ttsCacheDir(); if (existsSync(d)) for (const f of await readdir(d)) await rm(join(d, f), { recursive: true, force: true }) }
