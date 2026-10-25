// fal.ai Queue API. Docs: https://docs.fal.ai/model-apis/model-endpoints/queue
// Submit: POST https://queue.fal.run/{model}  -> { request_id, status_url, response_url }
// Status: GET status_url -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
// Result: GET response_url -> { video: { url } }
import { readFile } from 'node:fs/promises'
import { defineVideoProvider } from './base.js'

const headers = () => ({ authorization: `Key ${process.env.FAL_KEY}`, 'content-type': 'application/json' })
const textModel = () => process.env.FAL_TEXT_TO_VIDEO_MODEL || 'fal-ai/kling-video/v2.1/master/text-to-video'
const imageModel = () => process.env.FAL_IMAGE_TO_VIDEO_MODEL || 'fal-ai/kling-video/v2.1/standard/image-to-video'

async function call (url, init) {
  const res = await fetch(url, { ...init, headers: headers() })
  const t = await res.text()
  let j = {}; try { j = JSON.parse(t) } catch {}
  if (!res.ok) {
    const msg = j.detail ? (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)) : t.slice(0, 300)
    throw Object.assign(new Error(`fal.ai ${res.status}: ${msg}`), { status: res.status })
  }
  return j
}

export default defineVideoProvider({
  id: 'fal',
  name: 'fal.ai (Kling)',
  envVars: ['FAL_KEY'],
  async submit ({ prompt, imagePath, imageMime, aspect, duration }) {
    const model = imagePath ? imageModel() : textModel()
    const body = { prompt, duration: String(duration >= 10 ? 10 : 5), aspect_ratio: aspect }
    if (imagePath) body.image_url = `data:${imageMime || 'image/jpeg'};base64,${(await readFile(imagePath)).toString('base64')}`
    const r = await call(`https://queue.fal.run/${model}`, { method: 'POST', body: JSON.stringify(body) })
    return { externalId: r.request_id, data: { model, statusUrl: r.status_url, responseUrl: r.response_url } }
  },
  async status ({ externalId, data }) {
    const base = `https://queue.fal.run/${data.model.split('/').slice(0, 2).join('/')}/requests/${externalId}`
    const s = await call(data.statusUrl || `${base}/status`, { method: 'GET' })
    if (s.status === 'IN_QUEUE') return { state: 'PENDING', progress: 5 }
    if (s.status === 'IN_PROGRESS') return { state: 'PENDING', progress: 50 }
    if (s.status !== 'COMPLETED') return { state: 'ERROR', error: `fal.ai status ${s.status}` }
    if (s.error) return { state: 'ERROR', error: String(s.error) }
    const r = await call(data.responseUrl || base, { method: 'GET' })
    const url = r.video?.url || r.videos?.[0]?.url
    return url ? { state: 'DONE', videoUrl: url } : { state: 'ERROR', error: 'fal.ai returned no video' }
  }
})
