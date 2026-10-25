// Shared HTTP helpers for providers. Classifies failures into retryable vs permanent.
import { stat } from 'node:fs/promises'
import { openAsBlob, createReadStream } from 'node:fs'
import { RetryableError, ProviderAuthError } from '../base.js'

/**
 * fetch wrapper.
 * opts.safe = true  -> request has no side effects yet (upload/init/read): network/5xx are retryable.
 * opts.safe = false -> final "create post" call: only 429 (rejected, nothing created) is retryable.
 */
export async function request (url, init = {}, { safe = true, label = '' } = {}) {
  let res
  try {
    res = await fetch(url, init)
  } catch (e) {
    const msg = `${label} network error: ${e.message}`
    throw safe ? new RetryableError(msg) : new Error(msg)
  }
  if (res.ok) return res
  const text = await res.text().catch(() => '')
  let body = null
  try { body = JSON.parse(text) } catch {}
  const detail = extractError(body) || text.slice(0, 300) || res.statusText
  const msg = `${label} ${res.status}: ${detail}`.trim()
  if (res.status === 429) throw new RetryableError(msg)
  if (res.status === 401 || isAuthError(body)) throw new ProviderAuthError(msg)
  if (res.status >= 500 && safe) throw new RetryableError(msg)
  const err = new Error(msg)
  err.status = res.status
  err.body = body
  throw err
}

export async function json (url, init, opts) {
  const res = await request(url, init, opts)
  const t = await res.text()
  return t ? JSON.parse(t) : {}
}

function extractError (b) {
  if (!b) return ''
  if (b.error?.message) return b.error.message
  if (typeof b.error === 'string') return b.error_description ? `${b.error}: ${b.error_description}` : b.error
  if (b.error?.code && b.error?.message === undefined) return b.error.code
  if (b.message) return b.message
  return ''
}

function isAuthError (b) {
  // Meta: OAuthException code 190 = expired/invalid token
  if (b?.error?.code === 190 || b?.error?.type === 'OAuthException' && b?.error?.code === 102) return true
  if (b?.error?.code === 'access_token_invalid' || b?.error === 'invalid_grant') return true
  return false
}

export const form = obj => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null))
export const fileSize = async p => (await stat(p)).size
/** Streams from disk (no full buffering) when used as fetch/FormData body. */
export const fileBlob = (p, type) => openAsBlob(p, { type })
export const fileStream = (p, opts) => createReadStream(p, opts)
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const env = k => process.env[k] || ''
export const hasEnv = (...keys) => keys.every(k => !!process.env[k])
