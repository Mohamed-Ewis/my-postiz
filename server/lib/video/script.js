// AI script: topic/news text -> scenes [{ text, imagePrompt, duration }]
import { generateText } from '../ai.js'

export async function generateScript ({ topic, lang = 'ar', scenes = 4, aspect = '9:16' }) {
  if (!String(topic || '').trim()) throw Object.assign(new Error('اكتب الموضوع أو نص الخبر'), { statusCode: 400 })
  const n = Math.min(10, Math.max(2, Number(scenes) || 4))
  const language = lang === 'en' ? 'English' : 'Modern Standard Arabic (clear, suitable for Egyptian audience)'
  const prompt = `You write short vertical social videos (${aspect}). Turn the topic below into exactly ${n} scenes.
Rules: on-screen "text" per scene in ${language}, max 14 words, factual, no hashtags. "narration" is a slightly longer spoken line in the same language (max 30 words).
"imagePrompt" is an English prompt for a photorealistic, modern editorial image for that scene, no text in image.
"duration" seconds between 3 and 6. Also give a short "title" in ${language}.
Return ONLY JSON: {"title": "...", "scenes": [{"text": "...", "narration": "...", "imagePrompt": "...", "duration": 4}]}

Topic:
${topic}`
  const raw = await generateText(prompt)
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  let data
  try { data = JSON.parse(json) } catch { throw Object.assign(new Error('الـ AI رجّع سكريبت مش مفهوم، جرّب تاني'), { statusCode: 502 }) }
  return {
    title: String(data.title || '').slice(0, 120),
    scenes: (data.scenes || []).slice(0, n).map(s => ({
      text: String(s.text || '').slice(0, 200), narration: String(s.narration || s.text || '').slice(0, 600),
      imagePrompt: String(s.imagePrompt || '').slice(0, 600), duration: Math.min(6, Math.max(3, Number(s.duration) || 4))
    }))
  }
}
