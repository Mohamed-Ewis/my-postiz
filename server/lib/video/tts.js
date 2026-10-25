// Optional narration. Uses OpenAI TTS or Gemini TTS when a key exists; otherwise unavailable (skipped gracefully).
import { writeFile } from 'node:fs/promises'

export function ttsProvider () {
  const pref = (process.env.TTS_PROVIDER || '').toLowerCase()
  if (pref === 'none') return null
  if ((pref === 'openai' || !pref) && process.env.OPENAI_API_KEY) return 'openai'
  if ((pref === 'gemini' || !pref) && process.env.GEMINI_API_KEY) return 'gemini'
  return null
}

function wavHeader (dataLen, rate = 24000, ch = 1, bits = 16) {
  const b = Buffer.alloc(44)
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataLen, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * ch * bits / 8, 28); b.writeUInt16LE(ch * bits / 8, 32); b.writeUInt16LE(bits, 34)
  b.write('data', 36); b.writeUInt32LE(dataLen, 40)
  return b
}

/** Writes speech audio to outBase + ext. Returns the file path. */
export async function synthesize (text, outBase, { lang = 'ar' } = {}) {
  const p = ttsProvider()
  if (!p) throw new Error('No TTS provider (set OPENAI_API_KEY or GEMINI_API_KEY)')
  if (p === 'openai') {
    const res = await fetch(`${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/audio/speech`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: process.env.OPENAI_TTS_VOICE || 'alloy', input: text, response_format: 'mp3' })
    })
    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const file = outBase + '.mp3'
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
    return file
  }
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: (lang === 'ar' ? 'اقرأ بصوت مذيع أخبار واضح: ' : 'Read clearly like a news presenter: ') + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || 'Kore' } } } }
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${data?.error?.message || ''}`)
  const b64 = data?.candidates?.[0]?.content?.parts?.find(x => x.inlineData)?.inlineData?.data
  if (!b64) throw new Error('Gemini TTS returned no audio')
  const pcm = Buffer.from(b64, 'base64')
  const file = outBase + '.wav'
  await writeFile(file, Buffer.concat([wavHeader(pcm.length), pcm]))
  return file
}
