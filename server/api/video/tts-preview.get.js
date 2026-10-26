// GET /api/video/tts-preview?voice=ar-SA-HamedNeural → short WAV sample of the voice (cached).
import { readFile } from 'node:fs/promises'
import { synthesize, voiceId } from '~~/server/lib/video/tts.js'

export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const voice = voiceId(getQuery(event).voice)
  try {
    const r = await synthesize(['الكل أخبار. أهلًا بكم، وهذه أهم أخبار اليوم'], voice)
    setHeader(event, 'Content-Type', 'audio/wav'); setHeader(event, 'Cache-Control', 'private, max-age=86400')
    return await readFile(r.file)
  } catch (e) {
    throw createError({ statusCode: 503, statusMessage: `خدمة الصوت مش متاحة دلوقتي (${String(e.message || e).slice(0, 80)})` })
  }
})
