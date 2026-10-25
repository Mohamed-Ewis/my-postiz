import { prisma } from '../utils/db.js'

export const DEFAULT_SETTINGS = { timezone: 'Africa/Cairo', locale: 'ar', youtubePrivacy: 'public', tiktokPrivacy: 'SELF_ONLY', defaultSlots: ['10:00', '14:00', '19:00'] }

export async function getSetting (key, fallback = null) {
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) return fallback ?? DEFAULT_SETTINGS[key] ?? null
  try { return JSON.parse(row.value) } catch { return row.value }
}
export async function setSetting (key, value) {
  const v = JSON.stringify(value)
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } })
}
export async function getAllSettings () {
  const rows = await prisma.setting.findMany()
  const out = { ...DEFAULT_SETTINGS }
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value) } catch { out[r.key] = r.value } }
  return out
}
