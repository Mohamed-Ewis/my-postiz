// Video job runner (used by the worker). Local renders run one at a time in the background; AI jobs are polled.
import { writeFile } from 'node:fs/promises'
import { prisma } from '../../utils/db.js'
import { createMediaFromBuffer, safeMediaPath } from '../media.js'
import { nextFreeSlot } from '../slots.js'
import { renderVideo } from './render.js'
import { getVideoProvider } from '../../video-providers/index.js'

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
  await prisma.videoJob.update({ where: { id: job.id }, data: { state: 'DONE', progress: 100, stage: null, outputMediaId: media.id, finishedAt: new Date(), error: null } })
  await attachToPost(job, media.id)
}
async function fail (job, e) {
  await prisma.videoJob.update({ where: { id: job.id }, data: { state: 'ERROR', error: String(e.message || e).slice(0, 1000), finishedAt: new Date(), stage: null } })
}

/** Mark jobs left RENDERING by a crashed worker. */
export async function recoverVideoJobs () {
  await prisma.videoJob.updateMany({ where: { state: 'RENDERING', kind: 'render' }, data: { state: 'ERROR', error: 'Worker restarted during render — press Render again', stage: null } })
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

  // AI jobs: submit queued ones, poll running ones.
  const ai = await prisma.videoJob.findMany({ where: { kind: 'ai', state: { in: ['QUEUED', 'RENDERING'] } }, take: 10 })
  for (const job of ai) {
    n++
    try {
      const provider = getVideoProvider(job.provider || 'fal')
      if (!provider.isConfigured()) throw new Error(`${provider.name}: ${provider.envVars.join(', ')} missing in .env`)
      if (job.state === 'QUEUED') {
        const spec = parse(job.spec, {})
        let imagePath = null; let imageMime = null
        if (spec.imageMediaId) {
          const m = await prisma.media.findFirst({ where: { id: spec.imageMediaId, userId: job.userId } })
          if (m) { imagePath = safeMediaPath(m.path); imageMime = m.mimeType }
        }
        const r = await provider.submit({ prompt: spec.prompt, imagePath, imageMime, aspect: spec.aspect || '9:16', duration: spec.duration || 5 })
        await prisma.videoJob.update({ where: { id: job.id }, data: { state: 'RENDERING', startedAt: new Date(), externalId: r.externalId, externalData: JSON.stringify(r.data), progress: 3, stage: 'Submitted' } })
        continue
      }
      const s = await provider.status({ externalId: job.externalId, data: parse(job.externalData, {}) })
      if (s.state === 'PENDING') {
        await prisma.videoJob.update({ where: { id: job.id }, data: { progress: Math.max(job.progress, s.progress || job.progress), stage: 'Generating' } })
        if (Date.now() - job.createdAt.getTime() > 60 * 60 * 1000) await fail(job, new Error('AI video timed out (60 min)'))
        continue
      }
      if (s.state === 'ERROR') { await fail(job, new Error(s.error)); continue }
      const res = await fetch(s.videoUrl)
      if (!res.ok) throw new Error(`Download failed ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const media = await createMediaFromBuffer(job.userId, buf, `ai-video-${Date.now()}.mp4`, 'video/mp4')
      await finish(job, media)
    } catch (e) {
      // Network blips while polling: keep trying; anything else fails the job.
      if (job.state === 'RENDERING' && (e.name === 'TypeError' || (e.status >= 500))) continue
      await fail(job, e)
    }
  }
  return n
}

export const isRendering = () => !!rendering
export async function waitForRender () { if (rendering) await rendering }
