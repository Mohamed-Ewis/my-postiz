export const STATE_STYLES = {
  DRAFT: { cls: 'bg-slate-100 text-slate-700 border-slate-300', ar: 'مسودة', en: 'Draft' },
  QUEUE: { cls: 'bg-amber-50 text-amber-800 border-amber-300', ar: 'مجدول', en: 'Scheduled' },
  PUBLISHING: { cls: 'bg-sky-50 text-sky-800 border-sky-300', ar: 'بيتنشر', en: 'Publishing' },
  PUBLISHED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', ar: 'اتنشر', en: 'Published' },
  ERROR: { cls: 'bg-red-50 text-red-700 border-red-300', ar: 'خطأ', en: 'Error' }
}
export const PROVIDER_ICONS = { facebook: '📘', instagram: '📸', linkedin: '💼', x: '𝕏', youtube: '▶️', tiktok: '🎵', mock: '🧪' }
export const CHAR_LIMITS = { x: 280, instagram: 2200, linkedin: 3000, facebook: 63206, mock: 5000 }

/** Date -> value for <input type="datetime-local"> in local time. */
export function toLocalInput (d) {
  const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 16)
}
export const postDate = p => new Date(p.publishAt || p.createdAt)
