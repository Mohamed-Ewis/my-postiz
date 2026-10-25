import { saveBrand } from '~~/server/lib/brand.js'
export default defineEventHandler(async (event) => { await requireUserSession(event); return saveBrand(await readBody(event)) })
