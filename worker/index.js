// Standalone scheduler: `npm run worker`. Polls SQLite. No Redis needed.
import { runDue, checkPending, refreshTokens } from '../server/lib/publisher.js'
import { pollFeeds } from '../server/lib/feeds.js'
import { setSetting } from '../server/lib/settings.js'
import { prisma } from '../server/utils/db.js'
import { processVideoJobs, recoverVideoJobs, waitForRender } from '../server/lib/video/jobs.js'
import { ffmpegPath, ffmpegAvailable } from '../server/lib/video/ffmpeg.js'
import { ttsProvider } from '../server/lib/video/tts.js'

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS) || 15000
const SLOW_EVERY = 4 // feeds + token refresh every 4 ticks (~1 min)
let running = false
let ticks = 0

async function step (name, fn) {
  try {
    const n = await fn()
    if (n) console.log(`[worker] ${new Date().toLocaleString()} ${name}: ${n}`)
  } catch (e) { console.error(`[worker] ${name} failed:`, e.message) }
}

async function tick () {
  if (running) return
  running = true
  try {
    await step('published', runDue)
    await step('checked processing', checkPending)
    await step('video jobs', processVideoJobs)
    if (ticks % SLOW_EVERY === 0) {
      await step('tokens refreshed', refreshTokens)
      await step('feed posts', pollFeeds)
    }
    ticks++
    await setSetting('worker.heartbeat', { at: new Date().toISOString(), pid: process.pid, intervalMs: INTERVAL, ffmpeg: ffmpegAvailable(), ffmpegPath: ffmpegPath(), tts: ttsProvider() })
  } catch (e) {
    console.error('[worker] tick failed:', e.message)
  } finally { running = false }
}

console.log(`[worker] started, polling every ${INTERVAL / 1000}s, ffmpeg: ${ffmpegPath()}`)
await recoverVideoJobs()
tick()
const timer = setInterval(tick, INTERVAL)
const stop = async () => { clearInterval(timer); if (process.env.WAIT_RENDER_ON_EXIT === 'true') await waitForRender(); await prisma.$disconnect(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
