import { getAllSettings } from '~~/server/lib/settings.js'
import { aiInfo } from '~~/server/lib/ai.js'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const s = await getAllSettings()
  const hb = s['worker.heartbeat']
  const alive = hb?.at && Date.now() - new Date(hb.at).getTime() < Math.max(60000, (hb.intervalMs || 15000) * 3)
  return {
    timezone: s.timezone, locale: s.locale, youtubePrivacy: s.youtubePrivacy, tiktokPrivacy: s.tiktokPrivacy, defaultSlots: s.defaultSlots,
    ai: aiInfo(),
    worker: { lastHeartbeat: hb?.at || null, alive: !!alive },
    media: { dir: process.env.MEDIA_DIR || './storage/media', publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL || '', maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 4096 }
  }
})
