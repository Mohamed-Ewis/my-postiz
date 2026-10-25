// Shared gallery filter (used by PresetGallery.vue and tests).
// A preset matches a category chip by its primary data.category or any extra data.categories / filterCategories.
export const presetCategories = p => [...new Set([p?.data?.category, ...(p?.data?.categories || []), ...(p?.filterCategories || [])].filter(Boolean))]
export function filterPresets (presets = [], { category = '', lang = '' } = {}) {
  return presets.filter(p => (!category || presetCategories(p).includes(category)) && (!lang || (p.data?.lang || 'ar') === lang))
}
