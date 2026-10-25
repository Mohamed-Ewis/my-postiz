import { generateText } from '~~/server/lib/ai.js'
import { CATEGORIES } from '~~/server/templates/index.js'
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { text = '', lang = 'ar' } = await readBody(event)
  if (!String(text).trim()) throw createError({ statusCode: 400, statusMessage: 'الصق نص الخبر الأول' })
  const L = lang === 'en' ? 'English' : 'Modern Standard Arabic'
  const out = await generateText(`You are a news editor writing a social media news card in ${L}.
From the news text below return ONLY a JSON object with keys:
"headline" (max 12 words, factual, no clickbait, no emojis), "subtitle" (max 18 words), "source" (publisher/organisation if mentioned else ""),
"category" (one of: ${Object.keys(CATEGORIES).join(', ')}), "stat" (an object {"value","label"} if one key number dominates the story, else null).

News text:
${String(text).slice(0, 6000)}`)
  const m = String(out).match(/\{[\s\S]*\}/)
  let j = {}
  try { j = JSON.parse(m ? m[0] : out) } catch { throw createError({ statusCode: 502, statusMessage: 'رد الذكاء الاصطناعي مش مفهوم، جرّب تاني' }) }
  return { headline: j.headline || '', subtitle: j.subtitle || '', source: j.source || '', category: CATEGORIES[j.category] ? j.category : null, stat: j.stat?.value ? j.stat : null }
})
