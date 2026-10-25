/**
 * Provider contract. Every social provider module exports an object with this shape.
 *
 * @typedef {Object} TokenSet
 * @property {string} accessToken
 * @property {string} [refreshToken]
 * @property {Date|null} [expiresAt]
 *
 * @typedef {Object} ProviderAccount
 * @property {string} externalId
 * @property {string} name
 * @property {string} [username]
 * @property {string} [avatar]
 * @property {TokenSet} tokens
 * @property {Object} [meta]
 *
 * @typedef {Object} PublishInput
 * @property {string} content
 * @property {{url:string,path:string,mimeType:string}[]} media
 * @property {Object} settings
 *
 * @typedef {Object} PublishResult
 * @property {string} releaseId
 * @property {string} [releaseUrl]
 * @property {boolean} [pending]   true = still processing; worker will call checkStatus later
 *
 * @typedef {Object} SocialProvider
 * @property {string} id               unique key used in URLs, e.g. "facebook"
 * @property {string} name             display name
 * @property {boolean} usePkce         whether to generate a PKCE verifier
 * @property {string[]} scopes
 * @property {(ctx:{state:string, redirectUri:string, codeChallenge?:string}) => Promise<string>|string} getAuthUrl
 * @property {(ctx:{code:string, redirectUri:string, codeVerifier?:string, query:Object}) => Promise<ProviderAccount[]>} exchangeCode
 *           may return several accounts (e.g. multiple Facebook pages)
 * @property {(refreshToken:string, account:Object) => Promise<TokenSet>} refresh
 * @property {(account:{externalId:string, accessToken:string, meta:Object}, input:PublishInput) => Promise<PublishResult>} publish
 * @property {(account:Object, releaseId:string) => Promise<{state:'PUBLISHED'|'PENDING'|'ERROR', error?:string, releaseId?:string, releaseUrl?:string}>} checkStatus
 * @property {string[]} [envVars]  credentials needed; provider is disabled until all exist
 * @property {{ar:string,en:string}} [guide]  short setup guide
 * @property {(account:Object, releaseId:string, text:string) => Promise<{id:string}>} [comment]  first comment
 * @property {(account:Object, releaseId:string) => Promise<Object|null>} [analytics]
 *
 * Media items passed to publish: { id, type:'image'|'video', mimeType, path (absolute local file), size, url (public URL or null) }
 */

/** Helper to define a provider with basic validation. @param {SocialProvider} p */
export function defineProvider (p) {
  for (const k of ['id', 'name', 'getAuthUrl', 'exchangeCode', 'refresh', 'publish', 'checkStatus']) {
    if (!p[k]) throw new Error(`Provider missing "${k}"`)
  }
  return { usePkce: false, scopes: [], envVars: [], isConfigured () { return this.envVars.every(k => !!process.env[k]) }, ...p }
}

export class ProviderAuthError extends Error {
  constructor (message) { super(message); this.refreshNeeded = true }
}

/** Throw this when it is SAFE to retry (nothing was posted yet: network error, 5xx before create, rate limit). */
export class RetryableError extends Error {
  constructor (message) { super(message); this.retryable = true }
}
