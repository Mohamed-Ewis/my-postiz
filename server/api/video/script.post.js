import { generateScript } from '~~/server/lib/video/script.js'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  try { return await generateScript(await readBody(event)) } catch (e) {
    throw createError({ statusCode: e.statusCode || 500, statusMessage: e.message })
  }
})
