import { defineStore } from 'pinia'

const dict = {
  ar: {
    dashboard: 'الرئيسية', compose: 'إنشاء بوست', calendar: 'التقويم', accounts: 'الحسابات', media: 'الميديا', settings: 'الإعدادات', feeds: 'الأخبار التلقائية', video: 'إنشاء فيديو', poster: 'إنشاء بوستر', brand: 'الهوية',
    logout: 'خروج', login: 'تسجيل الدخول', email: 'الإيميل', password: 'كلمة السر', name: 'الاسم', setup: 'إعداد أول مرة',
    setupHint: 'اعمل حساب الأدمن بتاعك', loginBtn: 'دخول', createBtn: 'إنشاء الحساب', soon: 'قريبًا في الخطوة الجاية',
    statAccounts: 'حسابات متصلة', statQueued: 'بوستات مجدولة', statPublished: 'اتنشرت', statErrors: 'أخطاء',
    connect: 'ربط', connected: 'الحسابات المتصلة', noAccounts: 'مفيش حسابات متصلة لسه', available: 'منصات متاحة', welcome: 'أهلًا'
  },
  en: {
    dashboard: 'Dashboard', compose: 'Compose', calendar: 'Calendar', accounts: 'Accounts', media: 'Media', settings: 'Settings', feeds: 'Auto feeds', video: 'Video studio', poster: 'Poster studio', brand: 'Brand kit',
    logout: 'Log out', login: 'Sign in', email: 'Email', password: 'Password', name: 'Name', setup: 'First-run setup',
    setupHint: 'Create your admin account', loginBtn: 'Sign in', createBtn: 'Create account', soon: 'Coming in the next step',
    statAccounts: 'Connected accounts', statQueued: 'Queued posts', statPublished: 'Published', statErrors: 'Errors',
    connect: 'Connect', connected: 'Connected accounts', noAccounts: 'No accounts connected yet', available: 'Available platforms', welcome: 'Welcome'
  }
}

export const useUiStore = defineStore('ui', () => {
  const locale = useCookie('mp_locale', { default: () => 'ar' })
  const t = key => dict[locale.value]?.[key] ?? key
  const toggleLocale = () => { locale.value = locale.value === 'ar' ? 'en' : 'ar' }
  const l = (ar, en) => (locale.value === 'ar' ? ar : en)
  return { locale, t, l, toggleLocale }
})
