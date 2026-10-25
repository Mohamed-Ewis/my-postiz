import { listPresets } from '~~/server/lib/presets.js'
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const kind = ['poster', 'video'].includes(getQuery(event).kind) ? getQuery(event).kind : null
  return listPresets(userId, kind)
})
