import { prisma } from '../utils/db.js'
import { BUILTIN_PRESETS, STARTER_PHOTOS } from '../templates/presets.js'
import { cleanDesignInput } from './design.js'
import { CATEGORIES } from '../templates/index.js'

const parse = s => { try { return JSON.parse(s) } catch { return {} } }
export function cleanPresetData (d = {}, kind = 'poster') {
  const c = cleanDesignInput(d)
  const out = { ...c, focus: c.focus || { x: 0.5, y: 0.4 } }
  // Optional extra filter categories (primary `category` still drives styling).
  const extra = (Array.isArray(d.categories) ? d.categories : []).filter(k => CATEGORIES[k])
  out.categories = [...new Set([out.category, ...extra])]
  if (kind === 'video') out.aspect = ['9:16', '1:1', '16:9'].includes(d.aspect) ? d.aspect : '9:16'
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}
export const toUserPreset = p => ({ id: p.id, builtin: false, kind: p.kind, name: { ar: p.name, en: p.name }, thumb: `/api/design/presets/${p.id}/thumb`, data: parse(p.data), createdAt: p.createdAt })
export async function listPresets (userId, kind) {
  const mine = await prisma.designPreset.findMany({ where: { userId, ...(kind ? { kind } : {}) }, orderBy: { createdAt: 'desc' } })
  const builtins = BUILTIN_PRESETS.filter(p => !kind || p.kind === kind)
  return { presets: [...mine.map(toUserPreset), ...builtins], photos: STARTER_PHOTOS }
}
export async function findPreset (userId, id) {
  if (String(id).startsWith('builtin:')) return BUILTIN_PRESETS.find(p => p.id === id) || null
  const p = await prisma.designPreset.findFirst({ where: { id, userId } })
  return p ? toUserPreset(p) : null
}
