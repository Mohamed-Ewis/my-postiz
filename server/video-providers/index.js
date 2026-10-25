import fal from './fal.js'

const all = [fal]
export const listVideoProviders = () => all.map(p => ({ id: p.id, name: p.name, configured: p.isConfigured(), envVars: p.envVars }))
export function getVideoProvider (id) {
  const p = all.find(x => x.id === id)
  if (!p) throw Object.assign(new Error(`Unknown video provider ${id}`), { statusCode: 404 })
  return p
}
