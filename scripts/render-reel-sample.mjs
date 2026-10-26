// Render a sample "الكل" news reel from the bundled preset photos (no DB needed).
// Usage: node scripts/render-reel-sample.mjs [out.mp4] [category] [voice|none]   (sport = 3 items ~30s, others = 2 items ~20s)
import { normalizeReelSpec, renderReel } from '../server/lib/video/reel.js'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const out = resolve(process.argv[2] || 'reel-sample.mp4')
const ph = k => resolve('assets/presets/photos', `${k}.jpg`)
const category = process.argv[3] || 'sport'
const voiceArg = process.argv[4] || ''
const SAMPLES = {
  sport: [
    { file: ph('sport'), title: 'منتخب مصر يتأهل إلى نهائيات كأس العالم بعد فوز مثير في الدقائق الأخيرة', body: 'هدف قاتل في الدقيقة 89 يحسم بطاقة التأهل أمام جماهير ممتلئة', duration: 9 },
    { file: ph('trend'), title: 'محمد صلاح يعادل الرقم القياسي لأكثر لاعب تسجيلًا في تاريخ الدوري', body: '187 هدفًا في الدوري الإنجليزي حتى الآن', duration: 8.5 },
    { file: ph('politics'), title: 'القاهرة تستضيف ماراثون النيل الدولي بمشاركة 20 ألف عدّاء', body: '', duration: 8.5 }
  ],
  economy: [
    { file: ph('trend'), title: 'الاقتصاد المصري يسجل أعلى معدل نمو منذ ثلاث سنوات', body: 'مدفوعًا بالسياحة وقناة السويس', stat: { value: '4.2%', dir: 'up', label: 'نمو الناتج' }, duration: 8 },
    { file: ph('politics'), title: 'تراجع أسعار الذهب محليًا مع هدوء الطلب العالمي', body: '', stat: { value: '3,150', dir: 'down', label: 'جنيه لعيار 21' }, duration: 8 }
  ],
  politics: [
    { file: ph('politics'), title: 'قمة عربية طارئة في القاهرة لبحث تطورات الأوضاع الإقليمية', body: 'مشاركة 18 دولة ووزراء الخارجية يمهدون للبيان الختامي', duration: 8 },
    { file: ph('trend'), title: 'البرلمان يناقش مشروع قانون الإدارة المحلية الجديد', body: '', duration: 8 }
  ],
  trend: [
    { file: ph('trend'), title: 'تحدي «الكل» يكتسح السوشيال ميديا في 24 ساعة', body: '', duration: 8 },
    { file: ph('sport'), title: 'فيديو مشجع صغير في الاستاد يحصد 10 ملايين مشاهدة', body: 'والنادي يدعوه لحضور التدريب', duration: 8 }
  ],
  health: [
    { file: ph('medical'), title: 'دراسة: المشي 30 دقيقة يوميًا يقلل خطر أمراض القلب', body: 'نصائح بسيطة لروتين صحي يناسب الجميع', duration: 8 },
    { file: ph('trend'), title: 'شرب الماء بانتظام يحسّن التركيز خلال يوم العمل', body: '', duration: 8 }
  ],
  breaking: [
    { file: ph('politics'), title: 'زلزال بقوة 5.2 درجة يضرب شمال البحر الأحمر دون خسائر', body: 'الشعور بالهزة في عدة محافظات', duration: 8 },
    { file: ph('sport'), title: 'تأجيل مباراة القمة إلى الأسبوع المقبل لدواعٍ أمنية', body: '', duration: 8 }
  ]
}
const spec = normalizeReelSpec({
  category,
  handle: '@alkol',
  voice: voiceArg === 'none' ? { enabled: false } : { enabled: true, name: voiceArg || undefined },
  items: SAMPLES[category] || SAMPLES.sport
}, { allowFiles: true })
const t0 = Date.now()
const r = await renderReel(spec, { tmp: join(tmpdir(), `reel-${Date.now()}-${process.pid}`), outFile: out, update: async ({ stage, progress }) => stage && console.log(`${progress}% ${stage}`) })
if (r.voiceNote) console.log('note:', r.voiceNote)
console.log(`done ${out} ${r.duration.toFixed(2)}s in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
