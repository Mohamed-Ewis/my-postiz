import { TEMPLATES, CATEGORIES, SIZES, FONTS, DEFAULT_TEMPLATE } from '~~/server/templates/index.js'
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return { templates: TEMPLATES, categories: CATEGORIES, sizes: SIZES, fonts: Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.family])), defaults: DEFAULT_TEMPLATE }
})
