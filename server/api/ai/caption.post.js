const CHANNEL_HINTS = {
  facebook: 'Facebook: conversational, can be longer.',
  instagram: 'Instagram: hook first line, emojis ok, up to 10 hashtags at the end.',
  linkedin: 'LinkedIn: professional tone, short paragraphs, 3 hashtags max.',
  x: 'X/Twitter: under 280 characters.'
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { text = '', language = 'ar', channel = '', mode = 'caption' } = await readBody(event)
  if (!String(text).trim()) throw createError({ statusCode: 400, statusMessage: 'اكتب فكرة أو نص الأول' })
  const lang = language === 'en' ? 'English' : 'Egyptian-friendly Modern Arabic'
  const prompt = mode === 'hashtags'
    ? `Suggest 8 relevant hashtags (${lang} and English mix ok) for this social post. Return only hashtags separated by spaces.\n\nPost:\n${text}`
    : `You are a social media copywriter. Rewrite/expand the idea below into an engaging post in ${lang}. ${CHANNEL_HINTS[channel] || ''}
Add 3-6 relevant hashtags at the end. Return only the post text, no explanations, no quotes.\n\nIdea:\n${text}`
  return { text: await generateText(prompt) }
})
