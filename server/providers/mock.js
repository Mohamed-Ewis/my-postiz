import { randomUUID } from 'node:crypto'
import { defineProvider, RetryableError } from './base.js'

const retried = new Set()

/** Fake provider for local testing: OAuth loops straight back to our callback. */
export default defineProvider({
  id: 'mock',
  name: 'Mock (testing)',
  usePkce: true,
  getAuthUrl ({ state, redirectUri }) {
    const u = new URL(redirectUri)
    u.searchParams.set('code', 'mock-code')
    u.searchParams.set('state', state)
    return u.toString()
  },
  async exchangeCode () {
    return [{
      externalId: 'mock-1',
      name: 'Mock Page',
      username: 'mockpage',
      avatar: '',
      tokens: { accessToken: 'mock-access-' + randomUUID(), refreshToken: 'mock-refresh', expiresAt: new Date(Date.now() + 60 * 864e5) }
    }]
  },
  async refresh () {
    return { accessToken: 'mock-access-' + randomUUID(), refreshToken: 'mock-refresh', expiresAt: new Date(Date.now() + 60 * 864e5) }
  },
  // Test keywords: "#fail" -> permanent error, "#retry" -> retryable error once, then success.
  async publish (_account, input, ctx = {}) {
    if (input.content.includes('#fail')) throw new Error('Mock failure requested (#fail)')
    if (input.content.includes('#retry') && !retried.has(ctx.targetId)) {
      retried.add(ctx.targetId)
      throw new RetryableError('Mock temporary failure (#retry)')
    }
    const id = randomUUID()
    if (input.content.includes('#video')) return { releaseId: id, releaseUrl: `https://example.com/mock/${id}`, pending: true }
    console.log('[mock] publish:', input.content.slice(0, 80))
    return { releaseId: id, releaseUrl: `https://example.com/mock/${id}` }
  },
  async checkStatus () { return { state: 'PUBLISHED' } },
  async comment () { return { id: 'mock-comment-' + randomUUID() } },
  async analytics () { return { views: Math.floor(Math.random() * 1000), likes: Math.floor(Math.random() * 100) } }
})
