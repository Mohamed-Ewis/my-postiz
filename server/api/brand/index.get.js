import { getBrand } from '~~/server/lib/brand.js'
export default defineEventHandler(async (event) => { await requireUserSession(event); return getBrand() })
