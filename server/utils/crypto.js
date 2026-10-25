import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

function getKey () {
  // Plain process.env so this module also works in the standalone worker.
  const hex = process.env.NUXT_TOKEN_ENCRYPTION_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('NUXT_TOKEN_ENCRYPTION_KEY must be 64 hex chars')
  return Buffer.from(hex, 'hex')
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encryptToken (plain) {
  if (plain == null || plain === '') return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64')).join('.')
}

export function decryptToken (payload) {
  if (!payload) return null
  const [iv, tag, enc] = payload.split('.').map(p => Buffer.from(p, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

/** Password hashing with scrypt (no native deps). */
export function hashPasswordScrypt (password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPasswordScrypt (password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$')
  if (algo !== 'scrypt') return false
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(hashHex, 'hex')
  return expected.length === hash.length && timingSafeEqual(hash, expected)
}
