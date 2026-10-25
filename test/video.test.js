import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { normalizeSpec } = await import('../server/lib/video/render.js')
const { wrap, isRtl, captionPng } = await import('../server/lib/video/text.js')
process.env.FAL_KEY = 'k'
const fal = (await import('../server/video-providers/fal.js')).default

test('normalizeSpec clamps and validates', () => {
  const s = normalizeSpec({ aspect: '4:3', transition: { type: 'boom', duration: 9 }, scenes: [{ text: 'x', duration: 0.1 }, {}] })
  assert.equal(s.aspect, '9:16'); assert.equal(s.transition.type, 'fade'); assert.equal(s.transition.duration, 2)
  assert.equal(s.scenes.length, 1); assert.ok(s.scenes[0].duration >= 2.6)
  assert.throws(() => normalizeSpec({ scenes: [] }), /مشهد/)
})
test('text helpers', () => {
  assert.ok(isRtl('مرحبا')); assert.ok(!isRtl('hello'))
  assert.ok(wrap('one two three four five six seven eight nine ten', 200, 40).length > 1)
  const png = captionPng({ text: 'منتخب مصر', width: 540, height: 960 })
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
})
test('fal: submit with image data URI, then status -> result', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fal-')); const img = join(dir, 'a.jpg'); writeFileSync(img, Buffer.from([1, 2, 3]))
  const calls = []
  const replies = [
    { request_id: 'R1', status_url: 'https://queue.fal.run/fal-ai/kling-video/requests/R1/status', response_url: 'https://queue.fal.run/fal-ai/kling-video/requests/R1' },
    { status: 'IN_PROGRESS' },
    { status: 'COMPLETED' },
    { video: { url: 'https://cdn.fal/v.mp4' } }
  ]
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(replies.shift()), { status: 200 }) }
  const r = await fal.submit({ prompt: 'p', imagePath: img, imageMime: 'image/jpeg', aspect: '9:16', duration: 5 })
  assert.equal(r.externalId, 'R1')
  assert.match(calls[0].url, /^https:\/\/queue\.fal\.run\/fal-ai\/kling-video\/.*image-to-video$/)
  assert.equal(calls[0].init.headers.authorization, 'Key k')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.image_url, 'data:image/jpeg;base64,AQID'); assert.equal(body.aspect_ratio, '9:16'); assert.equal(body.duration, '5')
  assert.equal((await fal.status(r)).state, 'PENDING')
  const done = await fal.status(r)
  assert.deepEqual(done, { state: 'DONE', videoUrl: 'https://cdn.fal/v.mp4' })
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'bad key' }), { status: 401 })
  await assert.rejects(fal.submit({ prompt: 'p', aspect: '9:16' }), /401: bad key/)
})
