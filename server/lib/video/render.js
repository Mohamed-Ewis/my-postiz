// Video rendering: only the "الكل" news reel template is supported. Older job kinds (slideshow / AI video)
// are kept in the DB and still list/play, but can't be (re-)rendered.
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '../../utils/db.js'
import { mediaRoot, safeMediaPath, createMediaFromFile, newMediaPath } from '../media.js'
import { runFfmpeg } from './ffmpeg.js'
import { REEL_ID, normalizeReelSpec, renderReel } from './reel.js'

const parse = (v, d) => { try { return v ? JSON.parse(v) : d } catch { return d } }
export const UNSUPPORTED_JOB = 'نوع فيديو قديم مبقاش مدعوم — اعمل ريل جديد من صفحة الفيديو'
export const isReelSpec = spec => parse(typeof spec === 'string' ? spec : JSON.stringify(spec || {}), {}).template === REEL_ID

export async function renderVideo (job, update = async () => {}) {
  if (!isReelSpec(job.spec)) throw new Error(UNSUPPORTED_JOB)
  const spec = normalizeReelSpec(parse(job.spec, {}))
  const tmp = join(mediaRoot(), '.tmp', `job-${job.id}`)
  const resolveFile = async x => {
    const m = x.mediaId && await prisma.media.findFirst({ where: { id: x.mediaId, userId: job.userId } })
    if (!m) throw new Error(`Media not found: ${x.mediaId}`)
    return safeMediaPath(m.path)
  }
  try {
    const outFile = join(tmp, 'final.mp4')
    const r = await renderReel(spec, { tmp, outFile, resolveFile, update })
    await update({ stage: 'Saving', progress: 98 })
    const thumb = await newMediaPath('thumb.jpg', 'image/jpeg')
    await runFfmpeg(['-ss', String(r.timeline.segments[1].start + 2.5), '-i', outFile, '-frames:v', '1', '-q:v', '3', thumb.full])
    const media = await createMediaFromFile(job.userId, outFile, `${(job.title || 'reel').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'reel'}.mp4`, 'video/mp4', {
      width: r.info.width, height: r.info.height, duration: r.info.duration, thumbnail: thumb.rel
    })
    if (r.voiceNote) media.voiceNote = r.voiceNote
    return media
  } finally {
    if (process.env.VIDEO_KEEP_TMP !== 'true') await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}
