// Video job runner (used by the worker). Reel renders run one at a time in the background.
import { prisma } from '../../utils/db.js'
import { nextFreeSlot } from '../slots.js'
import { renderVideo, UNSUPPORTED_JOB } from './render.js'

const parse = (v, d) => { try { return v ? JSON.parse(v) : d } catch { return d } }
let rendering = null

/** When a job belongs to an AutoPost item: attach the video and release the post. */
async function attachToPost (job, mediaId) {
  if (!job.postId) return
  const post = await prisma.post.findUnique({ where: { id: job.postId }, include: { targets: true } })
  if (!post) return
  const spec = parse(job.spec, {})
  const queue = spec.afterRender === 'queue' && post.targets.length
  const publishAt = queue ? await nextFreeSlot(post.targets.map(t => t.accountId)) : post.publishAt
  await prisma.post.update({
    where: { id: post.id },
    data: { mediaIds: JSON.stringify([mediaId]), ...(queue && publishAt ? { state: 'QUEUE', publishAt } : {}) }
  })
  if (queue && publishAt) await prisma.postTarget.updateMany({ where: { postId: post.id }, data: { state: 'QUEUE' } })
}

async function finish (job, media) {
  await prisma.videoJob.update({ where: { id: job.id }, data: { state: 'DONE', progress: 100, stage: media.voiceNote ? `⚠️ ${media.voiceNote}` : null, outputMediaId: media.id, finishedAt: new Date(), error: null } })
  await attachToPost(job, media.id)
}
async function fail (job, e) {
  await prisma.videoJob.update({ where: { id: job.id }, data: { state: 'ERROR', error: String(e.message || e).slice(0, 1000), finishedAt: new Date(), stage: null } })
}

/** Mark jobs left RENDERING by a crashed worker. */
export async function recoverVideoJobs () {
  await prisma.videoJob.updateMany({ where: { state: 'RENDERING', kind: 'render' }, data: { state: 'ERROR', error: 'Worker restarted during render — press Render again', stage: null } })
  // Old AI-video jobs (fal.ai) are no longer processed.
  await prisma.videoJob.updateMany({ where: { kind: { not: 'render' }, state: { in: ['QUEUED', 'RENDERING'] } }, data: { state: 'ERROR', error: UNSUPPORTED_JOB, stage: null } })
}

export async function processVideoJobs () {
  let n = 0
  // Local render: one at a time, not awaited (so publishing keeps running while FFmpeg works).
  if (!rendering) {
    const next = await prisma.videoJob.findFirst({ where: { state: 'QUEUED', kind: 'render' }, orderBy: { createdAt: 'asc' } })
    if (next) {
      const claimed = await prisma.videoJob.updateMany({ where: { id: next.id, state: 'QUEUED' }, data: { state: 'RENDERING', startedAt: new Date(), progress: 1 } })
      if (claimed.count) {
        n++
        let lastWrite = 0
        const update = async ({ progress, stage }) => {
          const now = Date.now()
          if (now - lastWrite < 700 && !stage) return
          lastWrite = now
          await prisma.videoJob.update({ where: { id: next.id }, data: { ...(progress != null ? { progress } : {}), ...(stage ? { stage } : {}) } }).catch(() => {})
        }
        console.log(`[worker] rendering video ${next.id}`)
        rendering = renderVideo(next, update)
          .then(m => finish(next, m).then(() => console.log(`[worker] video ${next.id} done`)))
          .catch(e => { console.error('[worker] render failed:', e.message); return fail(next, e) })
          .finally(() => { rendering = null })
      }
    }
  }

  return n
}

export const isRendering = () => !!rendering
export async function waitForRender () { if (rendering) await rendering }
