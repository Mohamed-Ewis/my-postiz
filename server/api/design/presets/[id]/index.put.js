import { cleanPresetData, toUserPreset } from '~~/server/lib/presets.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  if (id.startsWith('builtin:')) throw createError({ statusCode: 403, statusMessage: 'القوالب الجاهزة مش بتتعدل — اعمل نسخة منها' })
  const p = await prisma.designPreset.findFirst({ where: { id, userId } })
  if (!p) throw createError({ statusCode: 404 })
  const b = await readBody(event)
  const data = {}
  if (b.name) data.name = String(b.name).trim().slice(0, 80)
  if (b.data) data.data = JSON.stringify(cleanPresetData(b.data, p.kind))
  return toUserPreset(await prisma.designPreset.update({ where: { id }, data }))
})
