// Provider unit tests with mocked fetch: `npm test`
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

Object.assign(process.env, {
  FACEBOOK_APP_ID: 'fbid', FACEBOOK_APP_SECRET: 'fbsecret', LINKEDIN_CLIENT_ID: 'li', LINKEDIN_CLIENT_SECRET: 'lis',
  GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'gs', TIKTOK_CLIENT_KEY: 'tk', TIKTOK_CLIENT_SECRET: 'ts', IG_POLL_MS: '1'
})
const { RetryableError, ProviderAuthError } = await import('../server/providers/base.js')
const facebook = (await import('../server/providers/facebook.js')).default
const instagram = (await import('../server/providers/instagram.js')).default
const linkedin = (await import('../server/providers/linkedin.js')).default
const { escapeLittleText } = await import('../server/providers/linkedin.js')
const youtube = (await import('../server/providers/youtube.js')).default
const tiktok = (await import('../server/providers/tiktok.js')).default
const { chunkPlan } = await import('../server/providers/tiktok.js')

const dir = mkdtempSync(join(tmpdir(), 'mp-test-'))
const img = join(dir, 'a.jpg'); writeFileSync(img, Buffer.alloc(1000, 1))
const vid = join(dir, 'v.mp4'); writeFileSync(vid, Buffer.alloc(5000, 2))
after(() => rmSync(dir, { recursive: true, force: true }))
const image = { id: 'm1', type: 'image', mimeType: 'image/jpeg', path: img, size: 1000, url: 'https://pub.example/a.jpg' }
const video = { id: 'm2', type: 'video', mimeType: 'video/mp4', path: vid, size: 5000, url: 'https://pub.example/v.mp4' }
const acct = { externalId: 'EXT', accessToken: 'TOKEN', meta: {}, username: 'me' }

// ---- fetch mock: queue of [matcher, response] ----
let calls; let routes
beforeEach(() => { calls = []; routes = [] })
const on = (match, res) => routes.push({ match, res })
globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  if (init.body?.destroy) { init.body.on('error', () => {}); init.body.destroy() }
  calls.push({ url, init })
  const i = routes.findIndex(r => (typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url)))
  if (i < 0) throw new Error('unmocked ' + url)
  const r = routes[i]; routes.splice(i, 1)
  if (r.res instanceof Error) throw r.res
  const { status = 200, body = {}, headers = {} } = r.res
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
}
const bodyOf = c => (c.init.body instanceof URLSearchParams ? Object.fromEntries(c.init.body) : c.init.body instanceof FormData ? Object.fromEntries([...c.init.body.keys()].map(k => [k, c.init.body.get(k)])) : JSON.parse(c.init.body))
const input = (content, media = [], settings = {}) => ({ content, media, settings })

// ---------------- Facebook ----------------
test('facebook: text post -> /feed with message', async () => {
  on('/EXT/feed', { body: { id: 'EXT_1' } })
  const r = await facebook.publish(acct, input('hello'))
  assert.equal(r.releaseId, 'EXT_1')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(bodyOf(calls[0]), { message: 'hello', access_token: 'TOKEN' })
})
test('facebook: single photo -> /photos multipart with source file', async () => {
  on('/EXT/photos', { body: { id: 'P', post_id: 'EXT_P' } })
  const r = await facebook.publish(acct, input('cap', [image]))
  assert.equal(r.releaseId, 'EXT_P')
  const b = bodyOf(calls[0]); assert.equal(b.caption, 'cap'); assert.equal(b.published, 'true'); assert.ok(b.source instanceof Blob)
})
test('facebook: multi photo -> unpublished uploads + attached_media', async () => {
  on('/EXT/photos', { body: { id: 'P1' } }); on('/EXT/photos', { body: { id: 'P2' } }); on('/EXT/feed', { body: { id: 'EXT_9' } })
  await facebook.publish(acct, input('x', [image, image]))
  const b = bodyOf(calls[2]); assert.equal(b['attached_media[1]'], '{"media_fbid":"P2"}')
})
test('facebook: video -> graph-video host, pending', async () => {
  on('graph-video.facebook.com', { body: { id: 'V1' } })
  const r = await facebook.publish(acct, input('vid', [video]))
  assert.equal(r.pending, true); assert.equal(r.releaseId, 'V1')
  on('/V1?', { body: { status: { video_status: 'ready' } } })
  assert.equal((await facebook.checkStatus(acct, 'V1')).state, 'PUBLISHED')
})
test('facebook: errors -> 429 retryable, 500 on final post permanent, 190 auth', async () => {
  on('/feed', { status: 429, body: { error: { message: 'rate' } } })
  await assert.rejects(facebook.publish(acct, input('a')), RetryableError)
  on('/feed', { status: 500, body: { error: { message: 'boom' } } })
  await assert.rejects(facebook.publish(acct, input('a')), e => !e.retryable && /boom/.test(e.message))
  on('/feed', { status: 400, body: { error: { message: 'expired', code: 190 } } })
  await assert.rejects(facebook.publish(acct, input('a')), ProviderAuthError)
  on('/photos', new TypeError('fetch failed')) // unpublished photo upload = safe
  await assert.rejects(facebook.publish(acct, input('a', [image, image])), RetryableError)
})
test('facebook: exchangeCode -> long-lived token then pages', async () => {
  on('oauth/access_token', { body: { access_token: 'short' } })
  on('oauth/access_token', { body: { access_token: 'long', expires_in: 5000000 } })
  on('me/accounts', { body: { data: [{ id: 'PG', name: 'Page', access_token: 'pt', picture: { data: { url: 'u' } } }] } })
  const a = await facebook.exchangeCode({ code: 'c', redirectUri: 'http://x/cb' })
  assert.equal(a[0].tokens.accessToken, 'pt')
  assert.match(calls[1].url, /grant_type=fb_exchange_token/)
  assert.match(calls[2].url, /access_token=long/)
})

// ---------------- Instagram ----------------
test('instagram: requires public url', async () => {
  await assert.rejects(instagram.publish(acct, input('x', [{ ...image, url: null }])), /MEDIA_PUBLIC_BASE_URL/)
  await assert.rejects(instagram.publish(acct, input('only text')), /صورة أو فيديو/)
})
test('instagram: image container -> poll FINISHED -> media_publish', async () => {
  on('/EXT/media?', { body: {} }) // never matched (POST has no query) – placeholder
  routes = []
  on(/\/EXT\/media$/, { body: { id: 'C1' } })
  on('/C1?', { body: { status_code: 'IN_PROGRESS' } })
  on('/C1?', { body: { status_code: 'FINISHED' } })
  on('media_publish', { body: { id: 'IGM' } })
  on('/IGM?', { body: { permalink: 'https://instagram.com/p/x' } })
  const r = await instagram.publish(acct, input('cap', [image]))
  assert.deepEqual(r, { releaseId: 'IGM', releaseUrl: 'https://instagram.com/p/x' })
  assert.equal(bodyOf(calls[0]).image_url, image.url)
  assert.equal(bodyOf(calls[3]).creation_id, 'C1')
})
test('instagram: reel stays pending, checkStatus publishes', async () => {
  process.env.IG_POLL_MS = '1'
  on(/\/EXT\/media$/, { body: { id: 'C2' } })
  for (let i = 0; i < 50; i++) on('/C2?', { body: { status_code: 'IN_PROGRESS' } })
  const orig = Date.now; let t = orig(); Date.now = () => (t += 5000)
  const r = await instagram.publish(acct, input('cap', [video])).finally(() => { Date.now = orig })
  assert.equal(r.pending, true); assert.equal(r.releaseId, 'container:C2')
  assert.equal(bodyOf(calls[0]).media_type, 'REELS')
  routes = []
  on('/C2?', { body: { status_code: 'FINISHED' } }); on('media_publish', { body: { id: 'R1' } }); on('/R1?', { body: { permalink: 'p' } })
  const s = await instagram.checkStatus(acct, 'container:C2')
  assert.equal(s.state, 'PUBLISHED'); assert.equal(s.releaseId, 'R1')
})

// ---------------- LinkedIn ----------------
test('linkedin: escape little text keeps hashtags', () => {
  assert.equal(escapeLittleText('a(b)'), 'a\\(b\\)')
})
test('linkedin: image upload flow + post body', async () => {
  on('images?action=initializeUpload', { body: { value: { uploadUrl: 'https://upload.li/x', image: 'urn:li:image:1' } } })
  on('upload.li', { status: 201, body: '' })
  on('/rest/posts', { status: 201, body: '', headers: { 'x-restli-id': 'urn:li:share:9' } })
  const r = await linkedin.publish(acct, input('Hi (there) #news', [image]))
  assert.equal(r.releaseId, 'urn:li:share:9')
  const post = bodyOf(calls[2])
  assert.equal(post.author, 'urn:li:person:EXT')
  assert.equal(post.commentary, 'Hi \\(there\\) #news')
  assert.equal(post.content.media.id, 'urn:li:image:1')
  assert.equal(calls[2].init.headers['X-Restli-Protocol-Version'], '2.0.0')
  assert.ok(calls[2].init.headers['LinkedIn-Version'])
})
test('linkedin: video init/upload/finalize with etags', async () => {
  on('videos?action=initializeUpload', { body: { value: { video: 'urn:li:video:1', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://up.li/1', firstByte: 0, lastByte: 2999 }, { uploadUrl: 'https://up.li/2', firstByte: 3000, lastByte: 4999 }] } } })
  on('up.li/1', { body: '', headers: { etag: 'e1' } }); on('up.li/2', { body: '', headers: { etag: 'e2' } })
  on('finalizeUpload', { body: '' })
  on('/rest/posts', { status: 201, body: '', headers: { 'x-restli-id': 'urn:li:share:2' } })
  await linkedin.publish(acct, input('v', [video]))
  assert.deepEqual(bodyOf(calls[3]).finalizeUploadRequest.uploadedPartIds, ['e1', 'e2'])
  assert.equal(calls[1].init.headers['content-length'], '3000')
})
test('linkedin: 503 during upload retryable, 503 on create permanent', async () => {
  on('images?action=initializeUpload', { status: 503, body: 'x' })
  await assert.rejects(linkedin.publish(acct, input('a', [image])), RetryableError)
  on('/rest/posts', { status: 503, body: 'x' })
  await assert.rejects(linkedin.publish(acct, input('a')), e => !e.retryable)
})

// ---------------- YouTube ----------------
test('youtube: resumable init + upload, pending then processed', async () => {
  on('uploadType=resumable', { body: '', headers: { location: 'https://upload.yt/session1' } })
  on('upload.yt/session1', { body: { id: 'VID' } })
  const r = await youtube.publish(acct, input('My title\nmore text', [video], { privacy: 'unlisted' }))
  assert.deepEqual(r, { releaseId: 'VID', releaseUrl: 'https://www.youtube.com/watch?v=VID', pending: true })
  const meta = bodyOf(calls[0])
  assert.equal(meta.snippet.title, 'My title'); assert.equal(meta.status.privacyStatus, 'unlisted')
  assert.equal(calls[0].init.headers['X-Upload-Content-Length'], '5000')
  on('videos?part=status', { body: { items: [{ status: { uploadStatus: 'processed' }, processingDetails: { processingStatus: 'succeeded' } }] } })
  assert.equal((await youtube.checkStatus(acct, 'VID')).state, 'PUBLISHED')
  on('videos?part=status', { body: { items: [{ status: { uploadStatus: 'rejected', rejectionReason: 'duplicate' } }] } })
  assert.equal((await youtube.checkStatus(acct, 'VID')).state, 'ERROR')
})
test('youtube: needs video; init 500 retryable; refresh keeps refresh token', async () => {
  await assert.rejects(youtube.publish(acct, input('x', [image])), /فيديو/)
  on('uploadType=resumable', { status: 500, body: 'x' })
  await assert.rejects(youtube.publish(acct, input('x', [video])), RetryableError)
  on('oauth2.googleapis.com/token', { body: { access_token: 'new', expires_in: 3600 } })
  const t = await youtube.refresh('R')
  assert.equal(t.accessToken, 'new'); assert.equal(t.refreshToken, 'R')
  on('oauth2.googleapis.com/token', { status: 400, body: { error: 'invalid_grant' } })
  await assert.rejects(youtube.refresh('R'), ProviderAuthError)
})

// ---------------- TikTok ----------------
test('tiktok: chunk plan', () => {
  assert.deepEqual(chunkPlan(5000), { chunkSize: 5000, count: 1 })
  const MB = 1024 * 1024
  assert.deepEqual(chunkPlan(100 * MB + 5), { chunkSize: 10 * MB, count: 10 })
})
test('tiktok: creator info -> init FILE_UPLOAD -> PUT chunk -> pending -> status', async () => {
  on('creator_info', { body: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } })
  on('video/init', { body: { data: { publish_id: 'PUB', upload_url: 'https://up.tt/1' }, error: { code: 'ok' } } })
  on('up.tt/1', { status: 201, body: '' })
  const r = await tiktok.publish(acct, input('caption', [video], { privacy: 'PUBLIC_TO_EVERYONE' }))
  assert.deepEqual(r, { releaseId: 'PUB', releaseUrl: null, pending: true })
  const init = bodyOf(calls[1])
  assert.equal(init.source_info.source, 'FILE_UPLOAD'); assert.equal(init.source_info.video_size, 5000)
  assert.equal(init.post_info.privacy_level, 'SELF_ONLY') // forced to allowed option
  assert.equal(calls[2].init.headers['content-range'], 'bytes 0-4999/5000')
  on('status/fetch', { body: { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['77'] }, error: { code: 'ok' } } })
  const s = await tiktok.checkStatus(acct, 'PUB')
  assert.equal(s.state, 'PUBLISHED'); assert.match(s.releaseUrl, /@me\/video\/77/)
  on('status/fetch', { body: { data: { status: 'FAILED', fail_reason: 'spam' }, error: { code: 'ok' } } })
  assert.equal((await tiktok.checkStatus(acct, 'PUB')).state, 'ERROR')
})
test('tiktok: 200 with error code -> permanent; token invalid flags refresh', async () => {
  on('creator_info', { body: { data: {}, error: { code: 'spam_risk_too_many_posts', message: 'x' } } })
  await assert.rejects(tiktok.publish(acct, input('c', [video])), e => !e.retryable && /spam_risk/.test(e.message))
  on('creator_info', { body: { data: {}, error: { code: 'access_token_invalid' } } })
  await assert.rejects(tiktok.publish(acct, input('c', [video])), e => e.refreshNeeded)
})

// ---------------- auth urls ----------------
test('auth urls contain client id, redirect and state', async () => {
  for (const [p, id] of [[facebook, 'fbid'], [linkedin, 'li'], [youtube, 'g'], [tiktok, 'tk']]) {
    const u = new URL(await p.getAuthUrl({ state: 'ST', redirectUri: 'http://localhost:3000/cb', codeChallenge: 'CH' }))
    assert.equal(u.searchParams.get('state'), 'ST')
    assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:3000/cb')
    assert.equal(u.searchParams.get('client_id') || u.searchParams.get('client_key'), id)
  }
  assert.ok(facebook.isConfigured())
})
