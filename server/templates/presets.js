// Built-in "ready templates" (قوالب جاهزة). Text is editable placeholder copy; starterPhoto refers to a
// bundled, freely licensed Wikimedia Commons photo (see assets/CREDITS.md) — optional, never the user's own.
export const STARTER_PHOTOS = {
  sport: { file: 'sport.jpg', title: "Dasarath Stadium during 2022 SAFF Women's Championship Final match", author: 'Aarogya1234', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Dasarath_Stadium_during_2022_SAFF_Women%27s_Championship_Final_match.jpg' },
  medical: { file: 'medical.jpg', title: 'Hospital Universitari Doctor Peset, València 11', author: '19Tarrestnom65', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Hospital_Universitari_Doctor_Peset,_Val%C3%A8ncia_11.jpg' },
  trend: { file: 'trend.jpg', title: 'Crowd of people with phones', author: 'Rawpixel Ltd', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', url: 'https://commons.wikimedia.org/wiki/File:Crowd_of_people_with_phones.jpg' },
  politics: { file: 'politics.jpg', title: 'Cairo skyline, Nile River, Egypt', author: 'Vyacheslav Argenberg', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Cairo_skyline,_Nile_River,_Egypt.jpg' },
}

const P = (id, name, d) => ({ id: `builtin:${id}`, builtin: true, kind: 'poster', name, thumb: `/presets/${id}.jpg`, data: { size: '4:5', lang: 'ar', ...d } })
const V = (id, name, d) => ({ id: `builtin:${id}`, builtin: true, kind: 'video', name, thumb: `/presets/${id}.jpg`, data: { size: '9:16', lang: 'ar', aspect: '9:16', templateId: 'type-only', ...d } })

export const BUILTIN_PRESETS = [
  P('ar-sport-editorial', { ar: 'رياضة · صورة كاملة', en: 'Sport · full-bleed' }, { templateId: 'editorial-photo', category: 'sport', headline: 'منتخب مصر يتأهل إلى نهائيات كأس العالم بعد فوز مثير في الدقائق الأخيرة', subtitle: 'هدف قاتل في الدقيقة 89 يحسم بطاقة التأهل أمام جماهير ممتلئة', source: 'الاتحاد المصري لكرة القدم', starterPhoto: 'sport', focus: { x: 0.5, y: 0.45 } }),
  P('ar-sport-stat', { ar: 'رياضة · رقم كبير', en: 'Sport · big number' }, { templateId: 'big-stat', category: 'sport', headline: 'محمد صلاح يعادل الرقم القياسي لأكثر لاعب تسجيلًا في تاريخ الدوري', stat: { value: '187', label: 'هدفًا في الدوري الإنجليزي' }, source: 'إحصاءات الموسم' }),
  P('ar-politics-split', { ar: 'سياسة · مقسوم فاتح', en: 'Politics · split light' }, { templateId: 'split-paper', category: 'politics-economy', headline: 'البرلمان يقر حزمة إصلاحات اقتصادية جديدة لدعم الاستثمار', subtitle: 'الحكومة تستهدف خفض العجز إلى 6% خلال عامين', source: 'مجلس النواب', starterPhoto: 'politics' }),
  P('ar-medical-split', { ar: 'صحة · مقسوم غامق', en: 'Health · split dark' }, { templateId: 'split-dark', category: 'medical', headline: 'دراسة جديدة: المشي 30 دقيقة يوميًا يقلل خطر أمراض القلب', subtitle: 'النتائج شملت أكثر من 50 ألف مشارك على مدار عشر سنوات', source: 'وزارة الصحة', starterPhoto: 'medical', focus: { x: 0.5, y: 0.35 } }),
  P('ar-trend-editorial', { ar: 'تريند · صورة كاملة', en: 'Trend · full-bleed' }, { templateId: 'editorial-photo', category: 'trend', headline: 'تحدي «صورة من الماضي» يتصدر المنصات بأكثر من 10 ملايين مشاركة', subtitle: 'المستخدمون يشاركون صورهم القديمة مع قصص طريفة', source: 'منصات التواصل', starterPhoto: 'trend' }),
  P('ar-trend-quote', { ar: 'اقتباس', en: 'Quote' }, { templateId: 'quote', category: 'quote', headline: 'النجاح ليس نهاية الطريق، والفشل ليس قاتلًا. الشجاعة في الاستمرار هي ما يصنع الفرق.', subtitle: 'وينستون تشرشل', source: 'اقتباس اليوم' }),
  P('ar-breaking', { ar: 'عاجل · صورة كاملة', en: 'Breaking · full photo' }, { templateId: 'breaking', category: 'breaking', categories: ['breaking', 'politics-economy'], headline: 'زلزال بقوة 5.2 درجة يضرب شرق المتوسط ولا أنباء عن خسائر', subtitle: 'المعهد القومي للبحوث الفلكية: الهزة شعر بها سكان عدة محافظات', source: 'المعهد القومي للبحوث الفلكية', starterPhoto: 'politics' }),
]
