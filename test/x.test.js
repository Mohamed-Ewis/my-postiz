// X provider tests with mocked fetch.
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

Object.assign(process.env, { X_CLIENT_ID: 'cid', X_CLIENT_SECRET: 'csec', X_INLINE_WAIT_MS: '0' })
const { RetryableError, ProviderAuthError } = await import('../server/providers/base.js')
const x = (await import('../server/providers/x.js')).default
const { xWeightedLength, splitThread } = await import('../utils/xText.js')

const dir = mkdtempSync(join(tmpdir(), 'x-test-'))
const img = join(dir, 'a.png'); writeFileSync(img, Buffer.alloc(1000, 1))
const VSIZE = 9 * 1024 * 1024 // 3 chunks of 4 MB
const vid = join(dir, 'v.mp4'); writeFileSync(vid, Buffer.alloc(VSIZE, 2))
after(() => rmSync(dir, { recursive: true, force: true }))
const image = { id: 'm1', type: 'image', mimeType: 'image/png', path: img, size: 1000 }
const video = { id: 'm2', type: 'video', mimeType: 'video/mp4', path: vid, size: VSIZE }
const acct = { externalId: 'U1', accessToken: 'TOKEN', meta: {}, username: 'me' }
const input = (content, media = [], settings = {}) => ({ content, media, settings })

let calls; let routes
beforeEach(() => { calls = []; routes = [] })
const on = (match, res) => routes.push({ match, res })
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init })
  const i = routes.findIndex(r => (typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url)))
  if (i < 0) throw new Error('unmocked ' + url)
  const r = routes.splice(i, 1)[0].res
  const { status = 200, body = {}, headers = {} } = r
  return new Response(JSON.stringify(body), { status, headers })
}
const tweetsCalls = () => calls.filter(c => c.url.endsWith('/2/tweets'))
const json = c => JSON.parse(c.init.body)

test('x: weighted length (Arabic 1, URL 23, emoji 2) and thread split', () => {
  assert.equal(xWeightedLength('مرحبا'), 5)
  assert.equal(xWeightedLength('see https://example.com/very/long/path?x=1'), 4 + 23)
  assert.equal(xWeightedLength('👍🏽'), 2)
  assert.equal(xWeightedLength('漢字'), 4)
  const long = Array.from({ length: 40 }, (_, i) => `هذه جملة رقم ${i + 1} في نص طويل.`).join(' ')
  const parts = splitThread(long)
  assert.ok(parts.length > 1)
  for (const p of parts) assert.ok(xWeightedLength(p) <= 280, p)
  assert.match(parts[0], /1\/\d+$/)
})

test('x: auth url uses PKCE S256 and the required scopes', () => {
  const u = new URL(x.getAuthUrl({ state: 's', redirectUri: 'http://localhost:3000/api/accounts/x/callback', codeChallenge: 'ch' }))
  assert.equal(u.origin + u.pathname, 'https://x.com/i/oauth2/authorize')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('scope'), 'tweet.read tweet.write users.read offline.access media.write')
})

test('x: text post -> POST /2/tweets', async () => {
  on('/2/tweets', { body: { data: { id: 'T1', text: 'hi' } } })
  const r = await x.publish(acct, input('hello X'))
  assert.equal(r.releaseId, 'T1'); assert.equal(r.releaseUrl, 'https://x.com/me/status/T1')
  assert.deepEqual(json(tweetsCalls()[0]), { text: 'hello X' })
  assert.equal(calls[0].init.headers.authorization, 'Bearer TOKEN')
})

test('x: over 280 without thread is a permanent error (nothing sent)', async () => {
  await assert.rejects(x.publish(acct, input('a'.repeat(281))), e => !e.retryable && /280/.test(e.message))
  assert.equal(calls.length, 0)
})

test('x: image -> /2/media/upload multipart then tweet with media_ids', async () => {
  on('/2/media/upload', { body: { data: { id: 'MED1' } } })
  on('/2/tweets', { body: { data: { id: 'T2' } } })
  await x.publish(acct, input('pic', [image]))
  const up = calls[0]
  assert.ok(up.init.body instanceof FormData)
  assert.equal(up.init.body.get('media_category'), 'tweet_image')
  assert.ok(up.init.body.get('media') instanceof Blob)
  assert.deepEqual(json(tweetsCalls()[0]).media, { media_ids: ['MED1'] })
})

test('x: video chunked INIT/APPEND×3/FINALIZE/STATUS then tweet', async () => {
  on('/2/media/upload/initialize', { body: { data: { id: 'V1' } } })
  for (let i = 0; i < 3; i++) on('/2/media/upload/V1/append', { body: {} })
  on('/2/media/upload/V1/finalize', { body: { data: { id: 'V1', processing_info: { state: 'pending', check_after_secs: 0 } } } })
  on('command=STATUS', { body: { data: { processing_info: { state: 'succeeded' } } } })
  on('/2/tweets', { body: { data: { id: 'T3' } } })
  process.env.X_INLINE_WAIT_MS = '5000'
  const r = await x.publish(acct, input('vid', [video]))
  process.env.X_INLINE_WAIT_MS = '0'
  assert.equal(r.releaseId, 'T3')
  assert.deepEqual(json(calls[0]), { media_type: 'video/mp4', total_bytes: VSIZE, media_category: 'tweet_video' })
  const appends = calls.filter(c => c.url.includes('/append'))
  assert.deepEqual(appends.map(c => c.init.body.get('segment_index')), ['0', '1', '2'])
  assert.equal(appends[0].init.body.get('media').size, 4 * 1024 * 1024)
  assert.equal(appends[2].init.body.get('media').size, VSIZE - 8 * 1024 * 1024)
  assert.deepEqual(json(tweetsCalls()[0]).media, { media_ids: ['V1'] })
})

test('x: video still processing -> pending (PROCESSING), checkStatus posts when ready', async () => {
  on('/initialize', { body: { data: { id: 'V2' } } })
  for (let i = 0; i < 3; i++) on('/append', { body: {} })
  on('/finalize', { body: { data: { id: 'V2', processing_info: { state: 'in_progress', check_after_secs: 5 } } } })
  const r = await x.publish(acct, input('later', [video]))
  assert.equal(r.pending, true); assert.equal(tweetsCalls().length, 0)
  on('command=STATUS', { body: { data: { processing_info: { state: 'in_progress' } } } })
  assert.equal((await x.checkStatus(acct, r.releaseId)).state, 'PENDING')
  on('command=STATUS', { body: { data: { processing_info: { state: 'succeeded' } } } })
  on('/2/tweets', { body: { data: { id: 'T4' } } })
  const s = await x.checkStatus(acct, r.releaseId)
  assert.equal(s.state, 'PUBLISHED'); assert.equal(s.releaseId, 'T4')
  assert.deepEqual(json(tweetsCalls()[0]), { text: 'later', media: { media_ids: ['V2'] } })
})

test('x: thread -> reply chain', async () => {
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} of a long announcement.`).join(' ')
  const n = splitThread(long).length
  for (let i = 0; i < n; i++) on('/2/tweets', { body: { data: { id: `TH${i}` } } })
  const r = await x.publish(acct, input(long, [], { thread: true }))
  assert.equal(r.releaseId, 'TH0')
  const tc = tweetsCalls(); assert.equal(tc.length, n)
  assert.equal(json(tc[0]).reply, undefined)
  for (let i = 1; i < n; i++) assert.deepEqual(json(tc[i]).reply, { in_reply_to_tweet_id: `TH${i - 1}` })
})

test('x: failure mid-thread is NOT retryable (avoid duplicates)', async () => {
  const long = 'word '.repeat(120)
  on('/2/tweets', { body: { data: { id: 'A' } } })
  on('/2/tweets', { status: 503, body: { title: 'Service Unavailable' } })
  await assert.rejects(x.publish(acct, input(long, [], { thread: true })), e => !e.retryable && /A/.test(e.message))
})

test('x: first comment = reply to the post', async () => {
  on('/2/tweets', { body: { data: { id: 'C1' } } })
  const c = await x.comment(acct, 'T1', 'first!')
  assert.equal(c.id, 'C1'); assert.deepEqual(json(calls[0]), { text: 'first!', reply: { in_reply_to_tweet_id: 'T1' } })
})

test('x: refresh uses Basic auth + refresh_token grant and keeps rotated token', async () => {
  on('/2/oauth2/token', { body: { access_token: 'NEW', refresh_token: 'R2', expires_in: 7200 } })
  const t = await x.refresh('R1')
  assert.equal(t.accessToken, 'NEW'); assert.equal(t.refreshToken, 'R2')
  assert.ok(t.expiresAt - Date.now() > 7100e3)
  assert.equal(calls[0].init.headers.authorization, 'Basic ' + Buffer.from('cid:csec').toString('base64'))
  const b = Object.fromEntries(calls[0].init.body)
  assert.equal(b.grant_type, 'refresh_token'); assert.equal(b.refresh_token, 'R1')
})

test('x: 429 -> RetryableError with retryAt from x-rate-limit-reset; 401 -> refresh needed', async () => {
  const reset = Math.floor(Date.now() / 1000) + 600
  on('/2/tweets', { status: 429, body: { title: 'Too Many Requests' }, headers: { 'x-rate-limit-reset': String(reset) } })
  await assert.rejects(x.publish(acct, input('hi')), e => e instanceof RetryableError && Math.abs(e.retryAt.getTime() - reset * 1000) < 5000)
  on('/2/tweets', { status: 401, body: { title: 'Unauthorized' } })
  await assert.rejects(x.publish(acct, input('hi')), e => e instanceof ProviderAuthError && e.refreshNeeded)
})
