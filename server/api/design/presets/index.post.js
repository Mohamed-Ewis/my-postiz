// Save current design as a user preset; or duplicate a preset ({ fromId }).
import { cleanPresetData, findPreset, toUserPreset } from '~~/server/lib/presets.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const b = await readBody(event)
  let kind = b.kind === 'video' ? 'video' : 'poster'
  let data = b.data
  let name = String(b.name || '').trim().slice(0, 80)
  if (b.fromId) {
    const src = await findPreset(userId, b.fromId)
    if (!src) throw createError({ statusCode: 404 })
    kind = src.kind; data = src.data
    if (!name) name = `${src.name.ar || src.name.en} (نسخة)`
  }
  if (!name) throw createError({ statusCode: 400, statusMessage: 'اكتب اسم للقالب' })
  const p = await prisma.designPreset.create({ data: { userId, kind, name, data: JSON.stringify(cleanPresetData(data, kind)) } })
  return toUserPreset(p)
})
