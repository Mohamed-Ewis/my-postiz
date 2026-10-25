import mock from './mock.js'
import facebook from './facebook.js'
import instagram from './instagram.js'
import linkedin from './linkedin.js'
import youtube from './youtube.js'
import tiktok from './tiktok.js'
import x from './x.js'

/** Registry. Real providers are enabled only when their env credentials exist. */
const all = [facebook, instagram, linkedin, x, youtube, tiktok]
if (process.env.ENABLE_MOCK_PROVIDER !== 'false') all.push(mock)
const providers = Object.fromEntries(all.map(p => [p.id, p]))

export const listProviders = () => all.map(p => ({ id: p.id, name: p.name, configured: p.isConfigured(), envVars: p.envVars, guide: p.guide || null }))
export function getProvider (id) {
  const p = providers[id]
  if (!p) throw Object.assign(new Error(`Unknown provider: ${id}`), { statusCode: 404 })
  return p
}
