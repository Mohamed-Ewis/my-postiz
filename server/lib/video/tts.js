// Arabic news voice-over (TTS). One fixed voice: Google Gemini TTS `ar-eg-podcaster-1` (natural, expressive, Egyptian).
// Microsoft Edge neural voice (free, no key, via msedge-tts) is only the last-resort fallback.
// Text is cleaned for natural reading (no URLs/emoji/sources, readable numbers), wrapped in SSML with a slightly
// slower rate and short pauses, cached per text+voice, then converted to WAV with tiny fades (no clipped edges).
import { mkdir, rename, rm, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { runFfmpeg, probe } from './ffmpeg.js'

// ONE voice for every reel: Gemini's Egyptian-native news/podcast host `ar-eg-podcaster-1` (male). Requests, old drafts and
// env vars can't change it. Edge's Shakir is only the last resort when every Gemini model fails, so a reel never fails.
export const FIXED_VOICE = 'gemini:ar-eg-podcaster-1'
export const DEFAULT_VOICE = FIXED_VOICE
export const EDGE_FALLBACK_VOICE = 'ar-EG-ShakirNeural'
export const TTS_RATE = process.env.TTS_RATE || '-7%'
export const voiceId = () => FIXED_VOICE
let geminiMock = null
export const geminiEnabled = () => !!(process.env.GEMINI_API_KEY || geminiMock)

// Per-category delivery (Gemini "style" prompt). Egyptian dialect, news-anchor tone that follows the reel's mood.
const STYLE_BASE = 'اقرأ باللهجة المصرية '
export const GEMINI_STYLES = {
  default: STYLE_BASE + 'بنبرة مذيع أخبار متحمس وطبيعي',
  sport: STYLE_BASE + 'بنبرة مذيع رياضي حماسي وسريع الإيقاع',
  economy: STYLE_BASE + 'بنبرة مذيع اقتصادي متزن وواضح وثابت',
  politics: STYLE_BASE + 'بنبرة جادة ورسمية ومتزنة كمذيع نشرة سياسية',
  trend: STYLE_BASE + 'بنبرة مرحة ونشيطة وخفيفة كمقدم ترند',
  health: STYLE_BASE + 'بنبرة دافئة وهادئة ومطمئنة',
  breaking: STYLE_BASE + 'بنبرة هادئة وجادة وعاجلة، كمذيع نشرة أخبار في خبر عاجل'
}
export const voiceStyle = category => GEMINI_STYLES[category] || GEMINI_STYLES.default
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
export function buildSsml (text, _voice, { rate = TTS_RATE } = {}) {
  const v = EDGE_FALLBACK_VOICE; const lang = v.slice(0, 5)
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

// ---- Gemini TTS ----
// Free tier is tiny (≈3 requests/min and ≈10/day per model) → one request per speech clip, sequential + throttled,
// a model fallback chain, quota-aware (a daily-limit 429 blocks that model and we move on), and Edge as the last resort.
// Chain entries: "model" (3.8 models use the Interactions API with a real style prompt) or "model:generate"
// (generateContent, style as a text prefix). Every entry must support the fixed voice.
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
// Only models that accept the ar-eg-podcaster-1 library voice (checked): the older 3.1/2.5 preview models only know prebuilt voices.
const DEFAULT_CHAIN = 'gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts:generate'
export const geminiModels = () => String(process.env.GEMINI_TTS_MODELS || process.env.GEMINI_TTS_MODEL || DEFAULT_CHAIN).split(',').map(x => x.trim()).filter(Boolean)
  .map(e => { const [model, mode] = e.split(':'); return { id: e, model, generate: mode === 'generate' || !/^gemini-3\.8/.test(model) } })
/** Tests: fn({ model, generate, text, style, voice }) → { data: Buffer, mime } (or throws {status, retryAfter, daily}). */
export function setGeminiProvider (fn) { geminiMock = fn || null }
const gemBlocked = new Map(); const gemLast = new Map()
export function resetGeminiState () { gemBlocked.clear(); gemLast.clear() }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const gemErr = (msg, extra) => Object.assign(new Error(msg), extra)

async function geminiHttp ({ model, generate, text, style, voice }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw gemErr('GEMINI_API_KEY is not set', { status: 401 })
  const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' }
  const name = String(voice).slice(7)
  let url; let body
  if (generate) {
    url = `${GEMINI_BASE}/models/${model}:generateContent`
    body = { contents: [{ parts: [{ text: `${style}:\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: name } } } } }
  } else {
    url = `${GEMINI_BASE}/interactions`
    body = { model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: name }] } }
  }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 90000)
  let r
  try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal }) } catch (e) { throw gemErr(`Gemini network error: ${e.name === 'AbortError' ? 'timeout' : e.message}`, { status: 0 }) } finally { clearTimeout(timer) }
  const raw = await r.text()
  let j = null; try { j = JSON.parse(raw) } catch {}
  if (!r.ok) {
    const msg = String(j?.error?.message || raw).replace(/\s+/g, ' ').slice(0, 200)
    const ra = Number(r.headers.get('retry-after')) || 0
    throw gemErr(`Gemini ${r.status}: ${msg}`, { status: r.status, retryAfter: ra, daily: r.status === 429 && (/per day|daily|\bRPD\b/i.test(msg) || ra > 300) })
  }
  let part
  if (generate) part = (j?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data)?.inlineData
  else { const c = (j?.steps || []).flatMap(st => st.content || []).find(x => x.type === 'audio' && x.data); part = c && { data: c.data, mimeType: c.mime_type } }
  if (!part) throw gemErr('Gemini returned no audio', { status: 502 })
  return { data: Buffer.from(part.data, 'base64'), mime: part.mimeType || part.mime_type || '' }
}

async function geminiAttempt (text, style, voice) {
  const call = geminiMock || geminiHttp
  const rawMin = process.env.GEMINI_TTS_MIN_INTERVAL_MS; const min = rawMin === undefined || rawMin === '' || !Number.isFinite(+rawMin) ? 21000 : +rawMin
  let lastErr = null
  for (const m of geminiModels()) {
    if ((gemBlocked.get(m.id) || 0) > Date.now()) { lastErr = lastErr || gemErr(`${m.id} quota is exhausted`, { status: 429 }); continue }
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const wait = (gemLast.get(m.id) || 0) + min - Date.now()
      if (wait > 0) await sleep(wait)
      gemLast.set(m.id, Date.now())
      try { return { ...(await call({ model: m.model, generate: m.generate, text, style, voice })), model: m.id } } catch (e) {
        lastErr = e
        if (e.status === 429) {
          if (e.daily) { gemBlocked.set(m.id, Date.now() + Math.min(Math.max((e.retryAfter || 3600) * 1000, 60000), 6 * 3600 * 1000)); break }
          if (tryNo === 0 && (e.retryAfter || 0) <= 70) { await sleep(Math.min((e.retryAfter ?? 20) * 1000, 70000)); continue } // per-minute limit: wait it out once
          gemBlocked.set(m.id, Date.now() + 60000); break
        }
        if (e.status === 0 || e.status >= 500) { if (tryNo === 0) { await sleep(2000); continue } }
        break // 400/401/403/… → next model
      }
    }
  }
  throw lastErr || new Error('Gemini TTS unavailable')
}
let gemQueue = Promise.resolve()
/** Serialised across concurrent jobs so the per-minute limit holds. Returns { data, mime, model }. */
export function geminiSpeak (text, style, voice) {
  const run = gemQueue.then(() => geminiAttempt(text, style, voice))
  gemQueue = run.catch(() => {})
  return run
}

// Shared post-processing: trim leading/trailing silence, tiny fades, 48k stereo WAV (cached by the caller).
const POLISH = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,afade=t=in:d=0.03,areverse,afade=t=in:d=0.12,areverse,highpass=f=70,aresample=48000'
async function polish (raw, out, inArgs = []) {
  const tmp = out + '.tmp.wav'
  await runFfmpeg([...inArgs, '-i', raw, '-af', POLISH, '-ac', '2', '-c:a', 'pcm_s16le', tmp])
  await rename(tmp, out)
}

async function speakOne (text, v, rate, cacheDir) {
  const ssml = buildSsml(text, v, { rate })
  const ev = EDGE_FALLBACK_VOICE
  const key = createHash('sha1').update(`${ev}|${rate}|${ssml}`).digest('hex').slice(0, 20)
  const wav = join(cacheDir, `${key}.wav`)
  if (existsSync(wav)) return wav
  const work = join(cacheDir, `.${key}-${process.pid}-${Date.now()}`)
  await mkdir(work, { recursive: true })
  try {
    let raw; let lastErr
    for (let i = 0; i < 2 && !raw; i++) { try { raw = await provider({ ssml, voice: ev, outDir: work, text }) } catch (e) { lastErr = e } }
    if (!raw || !existsSync(raw)) throw lastErr || new Error('TTS returned no audio')
    await polish(raw, join(work, 'out.wav'))
    await rename(join(work, 'out.wav'), wav)
    return wav
  } finally { await rm(work, { recursive: true, force: true }).catch(() => {}) }
}

/** One Gemini request for the whole clip (all parts) → cached 48k stereo WAV. Throws if every model failed. */
async function speakGemini (text, v, style, cacheDir) {
  const key = createHash('sha1').update(`gemini|${v}|${style}|${text}`).digest('hex').slice(0, 20)
  const wav = join(cacheDir, `g_${key}.wav`)
  if (existsSync(wav)) return wav
  const r = await geminiSpeak(text, style, v)
  const work = join(cacheDir, `.g${key}-${process.pid}-${Date.now()}`)
  await mkdir(work, { recursive: true })
  try {
    const riff = r.data.subarray(0, 4).toString('latin1') === 'RIFF'
    const rate = Number(/rate=(\d+)/i.exec(r.mime || '')?.[1]) || 24000
    const raw = join(work, riff ? 'in.wav' : 'in.pcm')
    await writeFile(raw, r.data)
    const out = join(work, 'out.wav')
    await polish(raw, out, riff ? [] : ['-f', 's16le', '-ar', String(rate), '-ac', '1'])
    await rename(out, wav)
    return wav
  } finally { await rm(work, { recursive: true, force: true }).catch(() => {}) }
}

/**
 * Speak parts (e.g. [title, body]) → { file: wav (48k stereo), duration, provider, voice, fallbackReason? }.
 * Always the fixed Gemini voice (`voice` is ignored): ONE request for the whole clip with the category `style`, cached by
 * text+voice+style. If Gemini is unavailable (no key, quota, error) it falls back to the Edge voice (parts cached separately
 * and joined with PART_GAP) unless { fallback: false }; if Edge fails too the error propagates (reel → music-only).
 */
export async function synthesize (parts, _voice, { rate = TTS_RATE, cacheDir = ttsCacheDir(), style = GEMINI_STYLES.default, fallback = true } = {}) {
  const v = FIXED_VOICE
  const texts = [].concat(parts).map(cleanForSpeech).filter(Boolean)
  if (!texts.length) throw new Error('No text to speak')
  await mkdir(cacheDir, { recursive: true })
  let fallbackReason = ''
  if (geminiEnabled()) {
    try {
      const file = await speakGemini(texts.join('\n'), v, style, cacheDir)
      const info = await probe(file)
      if (!(info.duration > 0.2)) { await rm(file, { force: true }); throw new Error('TTS audio is empty') }
      return { file, duration: info.duration, provider: 'gemini', voice: v }
    } catch (e) {
      if (!fallback) throw e
      fallbackReason = String(e.message || e).slice(0, 160)
      console.warn('[tts] Gemini failed, falling back to Edge:', fallbackReason)
    }
  } else if (!fallback) throw new Error('Gemini TTS is not enabled (no GEMINI_API_KEY)')
  else fallbackReason = 'GEMINI_API_KEY غير موجود'
  const ev = EDGE_FALLBACK_VOICE
  const files = []
  for (const t of texts) files.push(await speakOne(t, ev, rate, cacheDir))
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
  return { file: out, duration: info.duration, provider: 'edge', voice: ev, ...(fallbackReason ? { fallbackReason } : {}) }
}

/** Rough speaking-time estimate (seconds) for UI/limits: ~2.3 words/s at the default rate + pauses. */
export const estimateSpeech = text => { const w = cleanForSpeech(text).split(/\s+/).filter(Boolean).length; return w ? w / 2.3 + 0.4 : 0 }

export async function clearTtsCache () { const d = ttsCacheDir(); if (existsSync(d)) for (const f of await readdir(d)) await rm(join(d, f), { recursive: true, force: true }) }
