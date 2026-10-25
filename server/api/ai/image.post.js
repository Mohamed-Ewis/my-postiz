export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { prompt = '', aspect = '1:1' } = await readBody(event)
  if (!String(prompt).trim()) throw createError({ statusCode: 400, statusMessage: 'اكتب وصف الصورة' })
  const { buffer, mime } = await generateImage(String(prompt), { aspect })
  const m = await createMediaFromBuffer(userId, buffer, `ai-${Date.now()}.${mime.split('/')[1] || 'png'}`, mime)
  return { ...m, url: localMediaUrl(m.path) }
})
