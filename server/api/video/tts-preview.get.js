// GET /api/video/tts-preview → short WAV sample of the (fixed) voice-over voice (cached). Never falls back to another
// voice, so what you hear is what the reel will use (503 if Gemini is unavailable right now).
import { readFile } from 'node:fs/promises'
import { synthesize, FIXED_VOICE, voiceStyle } from '~~/server/lib/video/tts.js'

export default defineEventHandler(async (event) => {
  await requireUserId(event)
  try {
    const r = await synthesize(['الكل أخبار. أهلًا بكم، وهذه أهم أخبار اليوم'], FIXED_VOICE, { fallback: false, style: voiceStyle('default') })
    setHeader(event, 'Content-Type', 'audio/wav'); setHeader(event, 'Cache-Control', 'private, max-age=86400')
    return await readFile(r.file)
  } catch (e) {
    throw createError({ statusCode: 503, statusMessage: `خدمة الصوت مش متاحة دلوقتي (${String(e.message || e).slice(0, 80)})` })
  }
})
