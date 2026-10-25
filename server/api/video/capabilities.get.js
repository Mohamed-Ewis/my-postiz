import { listVideoProviders } from '~~/server/video-providers/index.js'
import { getSetting } from '~~/server/lib/settings.js'
import { aiInfo } from '~~/server/lib/ai.js'

// FFmpeg runs in the worker, so the worker reports what it found in its heartbeat.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const hb = await getSetting('worker.heartbeat', {})
  const alive = hb?.at && Date.now() - new Date(hb.at).getTime() < Math.max(60000, (hb.intervalMs || 15000) * 3)
  return {
    worker: !!alive,
    ffmpeg: hb?.ffmpeg ?? null,
    tts: hb?.tts ?? null,
    ai: aiInfo(),
    aiVideo: listVideoProviders(),
    aspects: ['9:16', '1:1', '16:9'],
    transitions: ['fade', 'dissolve', 'slideleft', 'slideright', 'smoothleft', 'circleopen', 'wipeleft', 'fadeblack']
  }
})
