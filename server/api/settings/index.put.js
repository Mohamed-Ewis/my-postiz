import { setSetting } from '~~/server/lib/settings.js'
import { validSlots } from '~~/server/lib/slots.js'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const b = await readBody(event)
  if (b.timezone) {
    try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }) } catch { throw createError({ statusCode: 400, statusMessage: 'Timezone غلط' }) }
    await setSetting('timezone', b.timezone)
  }
  if (b.locale) await setSetting('locale', b.locale === 'en' ? 'en' : 'ar')
  if (b.youtubePrivacy) await setSetting('youtubePrivacy', b.youtubePrivacy)
  if (b.tiktokPrivacy) await setSetting('tiktokPrivacy', b.tiktokPrivacy)
  if (b.defaultSlots) await setSetting('defaultSlots', validSlots(b.defaultSlots))
  return { ok: true }
})
