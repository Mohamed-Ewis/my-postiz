<template>
  <div class="space-y-4" dir="rtl">
    <!-- Draft restore -->
    <div v-if="draftPrompt" class="card flex flex-wrap items-center gap-3 bg-amber-50 border-amber-200">
      <span class="font-semibold">📝 تكملة المسودة؟</span>
      <span class="text-sm text-slate-600">{{ draftPrompt.items }} خبر · {{ catOf(draftPrompt.category).label }} · آخر حفظ {{ draftPrompt.when }}</span>
      <button class="btn !py-1.5 ms-auto" @click="restoreDraft">تكملة</button>
      <button class="rounded-xl border px-3 py-1.5 text-sm" @click="discardDraft">تجاهل وابدأ من جديد</button>
    </div>

    <!-- Step headers -->
    <ol class="grid grid-cols-4 gap-2 text-sm">
      <li v-for="(s, i) in steps" :key="i">
        <button type="button" class="w-full rounded-xl border px-3 py-2 text-start transition" :disabled="!canOpen(i + 1)"
          :class="st.step === i + 1 ? 'bg-brand-600 text-white border-brand-600' : canOpen(i + 1) ? 'bg-white hover:border-brand-400' : 'bg-slate-50 text-slate-400'"
          @click="go(i + 1)">
          <span class="inline-flex w-6 h-6 rounded-full items-center justify-center text-xs me-1" :class="st.step === i + 1 ? 'bg-white text-brand-700' : stepValid(i + 1) ? 'bg-emerald-500 text-white' : 'bg-slate-200'">{{ stepValid(i + 1) && st.step !== i + 1 ? '✓' : i + 1 }}</span>
          <span class="font-semibold">{{ s }}</span>
        </button>
      </li>
    </ol>

    <!-- STEP 1 -->
    <div v-if="st.step === 1" class="card space-y-4">
      <h2 class="font-semibold">١. اختار الفئة</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button v-for="c in cats" :key="c.key" type="button" class="rounded-2xl border-2 p-3 text-start transition"
          :style="st.category === c.key ? { borderColor: c.color, background: c.color + '14' } : {}" :class="st.category === c.key ? '' : 'border-slate-200 hover:border-slate-300'"
          @click="st.category = c.key">
          <div class="flex items-center gap-2"><span class="w-4 h-4 rounded-full" :style="{ background: c.color }" /><span class="font-bold">{{ c.label }}</span><span v-if="st.category === c.key" class="ms-auto">✓</span></div>
          <p class="text-xs text-slate-500 mt-1">{{ c.hint }}</p>
        </button>
      </div>
      <h2 class="font-semibold">مصدر الأخبار</h2>
      <div class="grid md:grid-cols-2 gap-3">
        <button v-for="s in sources" :key="s.key" type="button" class="rounded-2xl border-2 p-3 text-start" :class="st.source === s.key ? 'border-brand-600 bg-brand-50' : 'border-slate-200'" @click="st.source = s.key">
          <div class="font-bold">{{ s.icon }} {{ s.label }}</div><p class="text-xs text-slate-500 mt-1">{{ s.hint }}</p>
        </button>
      </div>
    </div>

    <!-- STEP 2 -->
    <div v-if="st.step === 2" class="space-y-4">
      <div v-if="st.source === 'ai'" class="card space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold">🤖 تجميع أخبار {{ catOf(st.category).label }}</h2>
          <button class="btn !py-1.5 ms-auto" :disabled="searching" @click="searchNews">{{ searching ? '⏳ بيدوّر...' : (results.length ? '🔄 تحديث' : '🔎 هات الأخبار') }}</button>
        </div>
        <p v-for="n in notices" :key="n" class="text-xs rounded-lg bg-amber-50 text-amber-800 px-2 py-1">ℹ️ {{ n }}</p>
        <div v-if="results.length" class="space-y-2 max-h-[28rem] overflow-y-auto">
          <label v-for="(r, i) in results" :key="i" class="flex gap-3 rounded-xl border p-2 cursor-pointer" :class="picked.includes(i) ? 'border-brand-500 bg-brand-50' : ''">
            <input v-model="picked" type="checkbox" :value="i" class="mt-1">
            <img v-if="r.imageUrl" :src="r.imageUrl" class="w-16 h-16 rounded-lg object-cover bg-slate-100" referrerpolicy="no-referrer" loading="lazy">
            <span v-else class="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400 text-center">بدون صورة</span>
            <span class="flex-1 min-w-0">
              <span class="block font-semibold text-sm" dir="auto">{{ r.headline || r.title }}</span>
              <span v-if="r.body" class="block text-xs text-slate-600" dir="auto">{{ r.body }}</span>
              <span class="block text-[11px] text-slate-400">{{ r.source }}<template v-if="r.publishedAt"> · {{ fmtDate(r.publishedAt) }}</template> <a v-if="r.url" :href="r.url" target="_blank" rel="noopener" class="text-brand-600" @click.stop>المصدر ↗</a></span>
            </span>
          </label>
        </div>
        <button v-if="results.length" class="btn" :disabled="!picked.length || importing" @click="addPicked">{{ importing ? '⏳ بينزّل الصور...' : `➕ أضف المختار (${picked.length})` }}</button>
      </div>

      <div class="card space-y-3">
        <div class="flex items-center gap-2"><h2 class="font-semibold">الأخبار ({{ st.items.length }})</h2>
          <span class="ms-auto text-sm" :class="overCap ? 'text-red-600 font-bold' : 'text-slate-500'">⏱ {{ fmtDur(total) }} / 3:00</span></div>
        <p v-if="overCap" class="text-sm rounded-lg bg-red-50 text-red-700 px-2 py-1">⚠️ المدة أكتر من ٣ دقايق{{ st.voiceOn ? ' (محسوبة مع وقت قراية المذيع)' : '' }} — قلّل عدد الأخبار أو اختصر العناوين.</p>
        <p v-if="!st.items.length" class="text-sm text-slate-500">لسه مفيش أخبار{{ st.source === 'ai' ? ' — هات أخبار من فوق أو أضف يدوي' : '' }}.</p>
        <div v-for="(it, i) in st.items" :key="it.key" class="rounded-2xl border p-3 space-y-2 bg-white" :class="dragOver === i ? 'ring-2 ring-brand-400' : ''"
          draggable="true" @dragstart="dragFrom = i" @dragover.prevent="dragOver = i" @dragleave="dragOver = -1" @drop.prevent="dropOn(i)" @dragend="dragOver = -1">
          <div class="flex items-center gap-2 text-sm">
            <span class="cursor-grab text-slate-400" title="اسحب لإعادة الترتيب">⠿</span><b>خبر {{ i + 1 }}</b>
            <span v-if="it.source" class="text-xs text-slate-400 truncate">· {{ it.source }}</span>
            <span class="ms-auto flex gap-1">
              <button class="rounded-lg border px-2" :disabled="i === 0" title="لفوق" @click="moveItem(i, -1)">▲</button>
              <button class="rounded-lg border px-2" :disabled="i === st.items.length - 1" title="لتحت" @click="moveItem(i, 1)">▼</button>
              <button class="rounded-lg border px-2 hover:bg-red-50 hover:text-red-600" title="حذف" @click="st.items.splice(i, 1)">🗑</button>
            </span>
          </div>
          <div class="grid md:grid-cols-[14rem_1fr] gap-3">
            <ImageUploadField v-model="it.mediaId" :items="library" :types="['image']" @uploaded="onUploaded" />
            <div class="space-y-2">
              <input v-model="it.title" class="input font-semibold" dir="auto" placeholder="عنوان الخبر *" maxlength="160">
              <textarea v-model="it.body" class="input" rows="2" dir="auto" placeholder="تفاصيل قصيرة (سطر واحد)" maxlength="220" />
              <div v-if="st.category === 'economy'" class="grid grid-cols-3 gap-2 text-sm">
                <input v-model="it.stat.value" class="input" placeholder="الرقم (مثلاً 48.5)" maxlength="12">
                <select v-model="it.stat.dir" class="input"><option value="">بدون سهم</option><option value="up">▲ صعود</option><option value="down">▼ هبوط</option></select>
                <input v-model="it.stat.label" class="input" placeholder="الوصف (جنيه/دولار)" maxlength="24">
              </div>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <button class="rounded-lg border px-2 py-1" :disabled="shortening === it.key || !it.title" @click="shorten(it)">{{ shortening === it.key ? '⏳' : '✂️' }} اختصر بالـ AI</button>
                <label class="flex items-center gap-1">⏱ <input v-model.number="it.duration" type="number" min="3" max="20" class="input !w-20 !py-1"> ث</label>
                <span v-if="!it.mediaId" class="text-xs text-amber-700">⚠️ محتاج صورة</span>
                <span v-if="!it.title.trim()" class="text-xs text-amber-700">⚠️ محتاج عنوان</span>
              </div>
            </div>
          </div>
        </div>
        <p v-if="aiMsg" class="text-xs text-amber-700">{{ aiMsg }}</p>
        <button class="rounded-xl border px-3 py-2 text-sm hover:border-brand-400" :disabled="st.items.length >= 20" @click="addItem">➕ إضافة خبر آخر</button>
      </div>
    </div>

    <!-- STEP 3 -->
    <div v-if="st.step === 3" class="grid lg:grid-cols-[1fr_20rem] gap-4">
      <div class="card space-y-3 text-sm">
        <h2 class="font-semibold">⚙️ إعدادات الفيديو</h2>
        <div class="grid md:grid-cols-2 gap-2">
          <label>الحساب<input v-model="st.handle" class="input" dir="ltr"></label>
          <label>جملة الختام (CTA)<input v-model="st.cta" class="input"></label>
        </div>
        <div class="rounded-xl border p-2 space-y-2">
          <label class="flex items-center gap-2 font-semibold"><input v-model="st.voiceOn" type="checkbox"> 🎙 تعليق صوتي (مذيع بيقرا الأخبار)</label>
          <div v-if="st.voiceOn" class="flex flex-wrap items-center gap-2">
            <select v-model="st.voiceName" class="input !w-auto !py-1">
              <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }}</option>
            </select>
            <button type="button" class="rounded-lg border px-2 py-1" :disabled="previewing" @click="previewVoice">{{ previewing ? '⏳' : '🔈' }} اسمع الصوت</button>
            <span class="text-xs text-slate-500">مدة كل خبر بتطول لوحدها لحد ما المذيع يخلص قراية</span>
          </div>
          <p v-if="voiceMsg" class="text-xs text-amber-700">{{ voiceMsg }}</p>
        </div>
        <label class="flex items-center gap-2"><input v-model="st.categoryMusic" type="checkbox"> 🎵 موسيقى الفئة ({{ catOf(st.category).label }})</label>
        <label class="flex items-center gap-2"><input v-model="st.sfx" type="checkbox"> 🔊 مؤثرات صوتية للمقدمة والختام</label>
        <div class="grid md:grid-cols-[1fr_8rem] gap-2 items-end">
          <MediaPicker v-model="st.music" :items="library" :types="['audio']" placeholder="موسيقى خاصة بيك (اختياري — بتلغي موسيقى الفئة)" />
          <label>الصوت<input v-model.number="st.musicVolume" type="range" min="0.05" max="1" step="0.05" class="w-full"></label>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1">مدة كل خبر <input v-model.number="bulkDur" type="number" min="3" max="20" class="input !w-20 !py-1"> ث</label>
          <button class="rounded-lg border px-2 py-1" @click="st.items.forEach(it => (it.duration = bulkDur))">طبّق على الكل</button>
          <span class="ms-auto" :class="overCap ? 'text-red-600 font-bold' : 'text-slate-500'">⏱ {{ fmtDur(total) }} / 3:00</span>
        </div>
        <label class="flex items-center gap-2"><input v-model="st.draft" type="checkbox"> ⚡ جودة تجريبية (أسرع)</label>
        <div class="flex flex-wrap items-center gap-2 pt-2 border-t">
          <button class="btn" :disabled="rendering || overCap || !stepValid(2)" @click="render">🎬 {{ st.videoMediaId ? 'إعادة إنشاء الفيديو' : 'إنشاء الفيديو' }}</button>
          <span v-if="stale" class="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">⚠️ في تعديلات بعد آخر إنشاء — المعاينة قديمة</span>
        </div>
        <div v-if="job && (job.state === 'QUEUED' || job.state === 'RENDERING')">
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-brand-600 transition-all" :style="{ width: (job.progress || 0) + '%' }" /></div>
          <div class="text-xs text-slate-500 mt-1">{{ job.state === 'QUEUED' ? 'في الطابور' : 'بيترندر' }} · {{ job.progress || 0 }}% <span v-if="job.stage">· {{ job.stage }}</span></div>
        </div>
        <p v-if="job?.state === 'DONE' && job.stage" class="text-xs rounded-lg bg-amber-50 text-amber-800 px-2 py-1">{{ job.stage }}</p>
        <p v-if="job?.error" class="text-red-600">{{ job.error }}</p>
        <p v-if="err" class="text-red-600">{{ err }}</p>
      </div>
      <div class="card !p-3 space-y-2">
        <h3 class="font-semibold text-sm">👁 المعاينة</h3>
        <div class="mx-auto aspect-[9/16] w-full max-w-[18rem] rounded-2xl bg-black overflow-hidden relative">
          <video v-if="videoUrl" :key="videoUrl" :src="videoUrl" :poster="st.videoThumb || undefined" controls playsinline class="w-full h-full object-contain" />
          <div v-else class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm p-4 text-center">الفيديو هيظهر هنا بعد الإنشاء</div>
          <div v-if="stale && videoUrl" class="absolute top-2 inset-x-2 rounded-lg bg-amber-400/90 text-xs text-black px-2 py-1 text-center">معاينة قديمة</div>
        </div>
      </div>
    </div>

    <!-- STEP 4 -->
    <div v-if="st.step === 4" class="grid lg:grid-cols-[1fr_16rem] gap-4">
      <div class="card space-y-3 text-sm">
        <h2 class="font-semibold">📤 النشر</h2>
        <div>
          <p class="text-slate-500 mb-1">الحسابات</p>
          <div class="flex flex-wrap gap-2">
            <label v-for="a in accounts" :key="a.id" class="flex items-center gap-2 rounded-xl border px-3 py-1.5 cursor-pointer" :class="st.accountIds.includes(a.id) ? 'border-brand-600 bg-brand-50' : ''">
              <input v-model="st.accountIds" type="checkbox" :value="a.id"><img v-if="a.avatar" :src="a.avatar" class="w-5 h-5 rounded-full">{{ a.name }} <span class="text-xs text-slate-400">{{ a.provider }}</span>
              <span v-if="a.refreshNeeded" class="text-xs text-amber-700">محتاج إعادة ربط</span>
            </label>
            <NuxtLink v-for="p in unconfigured" :key="p.id" to="/accounts" class="flex items-center gap-2 rounded-xl border border-dashed px-3 py-1.5 text-slate-400">{{ p.name }} <span class="text-xs rounded-full bg-amber-100 text-amber-800 px-2">محتاج إعداد</span></NuxtLink>
          </div>
          <p v-if="!accounts.length" class="text-amber-700 mt-1">مفيش حسابات متوصلة — <NuxtLink to="/accounts" class="underline">وصّل حساب</NuxtLink></p>
        </div>
        <div>
          <div class="flex items-center gap-2 mb-1"><span class="text-slate-500">الكابشن والهاشتاجات</span>
            <button class="ms-auto rounded-lg border px-2 py-0.5 text-xs" :disabled="capBusy" @click="makeCaption(true)">{{ capBusy ? '⏳' : '🔄' }} اكتب تاني</button></div>
          <textarea v-model="st.caption" rows="9" class="input" dir="auto" />
          <p v-if="capNote" class="text-xs text-slate-500 mt-1">{{ capNote }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-1"><input v-model="st.when" type="radio" value="now"> انشر دلوقتي</label>
          <label class="flex items-center gap-1"><input v-model="st.when" type="radio" value="schedule"> جدولة</label>
          <input v-if="st.when === 'schedule'" v-model="st.publishAt" type="datetime-local" class="input !w-auto">
        </div>
        <div class="flex items-center gap-2 pt-2 border-t">
          <button class="btn" :disabled="publishing || !canPublish" @click="publish">{{ publishing ? '⏳' : st.when === 'now' ? '🚀 انشر الآن' : '🗓 جدول البوست' }}</button>
          <span v-if="stale" class="text-xs text-amber-700">⚠️ الفيديو مش متحدّث بآخر تعديلات — ارجع للخطوة ٣</span>
        </div>
        <p v-if="err" class="text-red-600">{{ err }}</p>
        <p v-if="okMsg" class="text-emerald-700 font-semibold">{{ okMsg }}</p>
      </div>
      <div class="card !p-3">
        <div class="mx-auto aspect-[9/16] w-full max-w-[14rem] rounded-2xl bg-black overflow-hidden">
          <video v-if="videoUrl" :src="videoUrl" :poster="st.videoThumb || undefined" controls playsinline class="w-full h-full object-contain" />
        </div>
      </div>
    </div>

    <!-- Nav -->
    <div class="flex items-center gap-2">
      <button v-if="st.step > 1" class="rounded-xl border px-4 py-2" @click="go(st.step - 1)">→ السابق</button>
      <span v-if="blockMsg" class="text-sm text-amber-700">{{ blockMsg }}</span>
      <button v-if="st.step < 4" class="btn ms-auto" :disabled="!stepValid(st.step)" @click="go(st.step + 1)">التالي ←</button>
    </div>
  </div>
</template>

<script setup>
// 4-step news-reel wizard: category/source → news → render & preview → publish/schedule. Draft autosaves to localStorage.
const props = defineProps({ library: { type: Array, default: () => [] } })
const emit = defineEmits(['uploaded', 'rendered'])
const DRAFT_KEY = 'mypostiz.reelStepper.v1'
const steps = ['الفئة والمصدر', 'الأخبار', 'الإنشاء والمعاينة', 'النشر']
const cats = [
  { key: 'sport', label: 'رياضة', color: '#00C853', hint: 'حماسي — كشف السطور + موسيقى حماسية' }, { key: 'economy', label: 'اقتصاد', color: '#FFB300', hint: 'بيانات — رقم بارز + سهم صعود/هبوط' },
  { key: 'politics', label: 'سياسة', color: '#2F6BFF', hint: 'رسمي — شريط سفلي وحركة هادية' }, { key: 'trend', label: 'ترند', color: '#FF2D87', hint: 'مرح — خط أعرض وظهور سريع' },
  { key: 'health', label: 'صحة', color: '#00BFA5', hint: 'هادي — كارت فاتح بحواف ناعمة' }, { key: 'breaking', label: 'عاجل', color: '#FF1F1F', hint: 'عاجل — بانر أحمر كبير' }
]
const sources = [{ key: 'manual', icon: '✍️', label: 'يدوي', hint: 'اكتب الأخبار وارفع صورها بنفسك' }, { key: 'ai', icon: '🤖', label: 'تجميع بالـ AI', hint: 'أخبار حقيقية من الفيدات بتاعتك + Google News، والـ AI يرتّب ويختصر' }]
const catOf = k => cats.find(c => c.key === k) || cats[0]
let key = Date.now()
const newItem = (o = {}) => ({ key: ++key, mediaId: null, title: '', body: '', duration: 7, stat: { value: '', dir: '', label: '' }, source: '', url: '', ...o })
const fresh = () => ({ step: 1, category: '', source: '', items: [], handle: '@alkol', cta: 'تابعونا', sfx: true, categoryMusic: true, music: null, musicVolume: 0.25, voiceOn: true, voiceName: 'ar-EG-ShakirNeural', draft: false, jobId: null, videoMediaId: null, videoUrl: '', videoThumb: '', renderedSig: '', caption: '', captionSig: '', accountIds: [], when: 'now', publishAt: '' })
const st = reactive(fresh())
const library = computed(() => props.library)
function onUploaded (m) { emit('uploaded', m) }

// ---- duration / validation
// With voice-over each item lasts at least as long as its reading (≈1.6 words/s at the anchor pace).
const speech = t => { const w = String(t || '').trim().split(/\s+/).filter(Boolean).length; return w ? w / 1.6 + 0.5 : 0 }
const itemDur = it => { const d = Number(it.duration) || 7; return st.voiceOn ? Math.max(d, 1.6 + speech(it.title) + (it.body ? 0.45 + speech(it.body) : 0)) : d }
const total = computed(() => st.items.length ? (st.voiceOn ? 3 : 2.5) + 3 + st.items.reduce((a, it) => a + itemDur(it), 0) - 0.5 * (st.items.length + 1) : 0)
const overCap = computed(() => total.value > 180)
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const fmtDate = d => new Date(d).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const validItems = computed(() => st.items.filter(it => it.mediaId && it.title.trim()))
const sig = computed(() => JSON.stringify([st.category, st.handle, st.cta, st.sfx, st.categoryMusic, st.voiceOn, st.voiceName, st.music, st.musicVolume, st.draft, validItems.value.map(({ key: _k, source: _s, url: _u, ...it }) => it)]))
const stale = computed(() => !!st.renderedSig && st.renderedSig !== sig.value)
function stepValid (n) {
  if (n === 1) return !!(st.category && st.source)
  if (n === 2) return stepValid(1) && validItems.value.length > 0 && !overCap.value
  if (n === 3) return stepValid(2) && !!st.videoMediaId && !stale.value
  return false
}
const canOpen = n => n === 1 || stepValid(n - 1)
const blockMsg = computed(() => {
  if (st.step === 1 && !stepValid(1)) return !st.category ? 'اختار الفئة' : 'اختار مصدر الأخبار'
  if (st.step === 2 && !stepValid(2)) return overCap.value ? 'المدة أكتر من ٣ دقايق' : 'محتاج خبر واحد على الأقل بعنوان وصورة'
  if (st.step === 3 && !stepValid(3)) return stale.value ? 'أعد إنشاء الفيديو بعد التعديلات' : 'أنشئ الفيديو الأول'
  return ''
})
function go (n) { if (n < st.step || canOpen(n)) { st.step = n; err.value = ''; if (n === 4) makeCaption(false) } }

// ---- items
function addItem () { st.items.push(newItem()) }
function moveItem (i, d) { const s = st.items.splice(i, 1)[0]; st.items.splice(i + d, 0, s) }
const dragFrom = ref(-1); const dragOver = ref(-1)
function dropOn (i) { if (dragFrom.value >= 0 && dragFrom.value !== i) { const s = st.items.splice(dragFrom.value, 1)[0]; st.items.splice(i, 0, s) } dragFrom.value = dragOver.value = -1 }
const shortening = ref(null); const aiMsg = ref('')
async function shorten (it) {
  shortening.value = it.key; aiMsg.value = ''
  try { const r = await $fetch('/api/video/news-ai', { method: 'POST', body: { action: 'shorten', title: it.title, body: it.body } }); if (r.ai === false && r.notice) aiMsg.value = r.notice; else { it.title = r.title; it.body = r.body } } catch (e) { aiMsg.value = e.data?.statusMessage || e.message } finally { shortening.value = null }
}

// ---- AI news search
const results = ref([]); const picked = ref([]); const notices = ref([]); const searching = ref(false); const importing = ref(false)
async function searchNews () {
  searching.value = true; notices.value = []
  try {
    const r = await $fetch('/api/video/news-search', { method: 'POST', body: { category: st.category, lang: 'ar' } })
    results.value = r.items; notices.value = r.notices || []
    picked.value = r.items.map((x, i) => (x.imageUrl ? i : -1)).filter(i => i >= 0).slice(0, 5)
  } catch (e) { notices.value = [e.data?.statusMessage || e.message] } finally { searching.value = false }
}
async function addPicked () {
  importing.value = true
  try {
    const chosen = picked.value.slice().sort((a, b) => a - b).map(i => results.value[i])
    const { media } = await $fetch('/api/video/news-ai', { method: 'POST', body: { action: 'import', items: chosen.map(c => ({ imageUrl: c.imageUrl, title: c.title })) } })
    chosen.forEach((c, k) => { if (media[k]) emit('uploaded', media[k]); st.items.push(newItem({ title: c.headline || c.title, body: c.body || '', mediaId: media[k]?.id || null, source: c.source, url: c.url })) })
    const missing = media.filter(m => !m).length
    if (missing) notices.value = [...notices.value, `${missing} خبر من غير صورة — اختار صورة ليهم`]
    results.value = results.value.filter((_, i) => !picked.value.includes(i)); picked.value = []
  } catch (e) { notices.value = [e.data?.statusMessage || e.message] } finally { importing.value = false }
}

// ---- render
const rendering = ref(false); const err = ref(''); const job = ref(null); const bulkDur = ref(7)
const videoUrl = computed(() => st.videoUrl)
async function render () {
  err.value = ''; rendering.value = true
  const s = sig.value
  try {
    const spec = { template: 'news-reel', category: st.category, handle: st.handle, cta: st.cta, sfx: st.sfx, categoryMusic: st.categoryMusic, voice: { enabled: st.voiceOn, name: st.voiceName }, quality: st.draft ? 'draft' : 'hd',
      items: validItems.value.map(it => ({ mediaId: it.mediaId, title: it.title, body: it.body, duration: it.duration, stat: st.category === 'economy' && String(it.stat?.value || '').trim() ? it.stat : null })),
      music: st.music ? { mediaId: st.music, volume: st.musicVolume } : null }
    const j = await $fetch('/api/video/jobs', { method: 'POST', body: { title: `ريل ${catOf(st.category).label} — ${validItems.value[0].title}`, spec } })
    st.jobId = j.id; job.value = j; emit('rendered')
    pendingSig = s; poll()
  } catch (e) { err.value = e.data?.statusMessage || e.message; rendering.value = false }
}
let pendingSig = ''; let timer = null
async function poll () {
  clearTimeout(timer)
  try {
    const list = await $fetch('/api/video/jobs')
    const j = list.find(x => x.id === st.jobId)
    job.value = j || null
    if (j?.state === 'DONE' && j.output) { st.videoMediaId = j.output.id; st.videoUrl = j.output.url; st.videoThumb = j.output.thumbUrl || ''; st.renderedSig = pendingSig || sig.value; rendering.value = false; emit('rendered'); return }
    if (!j || j.state === 'ERROR') { rendering.value = false; emit('rendered'); return }
  } catch {}
  timer = setTimeout(poll, 2000)
}

// ---- voice-over
const voices = [
  { id: 'ar-SA-HamedNeural', label: 'حامد — رجالي (فصحى)' }, { id: 'ar-SA-ZariyahNeural', label: 'زارية — حريمي (فصحى)' },
  { id: 'ar-EG-ShakirNeural', label: 'شاكر — رجالي (مصري)' }, { id: 'ar-EG-SalmaNeural', label: 'سلمى — حريمي (مصري)' }
]
const previewing = ref(false); const voiceMsg = ref(''); let previewAudio = null
async function previewVoice () {
  previewing.value = true; voiceMsg.value = ''
  try {
    const blob = await $fetch('/api/video/tts-preview', { query: { voice: st.voiceName }, responseType: 'blob' })
    previewAudio?.pause(); previewAudio = new Audio(URL.createObjectURL(blob)); await previewAudio.play()
  } catch (e) { voiceMsg.value = (e.data?.statusMessage || e.message) + ' — لو فضلت كده الفيديو هيتعمل بالموسيقى بس' } finally { previewing.value = false }
}

// ---- publish
const { data: accData } = useFetch('/api/accounts', { server: false })
const accounts = computed(() => (accData.value?.accounts || []).filter(a => !a.disabled))
const unconfigured = computed(() => (accData.value?.providers || []).filter(p => !p.configured && p.id !== 'mock'))
const capBusy = ref(false); const capNote = ref(''); const publishing = ref(false); const okMsg = ref('')
async function makeCaption (force) {
  const csig = JSON.stringify([st.category, validItems.value.map(i => i.title)])
  if (!force && st.caption && st.captionSig === csig) return
  capBusy.value = true; capNote.value = ''
  try { const r = await $fetch('/api/video/news-ai', { method: 'POST', body: { action: 'caption', category: st.category, handle: st.handle, items: validItems.value.map(i => ({ title: i.title })) } }); st.caption = r.caption; st.captionSig = csig; capNote.value = r.ai ? '✨ مكتوب بالـ AI — عدّل براحتك' : 'كابشن جاهز من العناوين (مفيش مفتاح AI) — عدّل براحتك' } catch (e) { capNote.value = e.data?.statusMessage || e.message } finally { capBusy.value = false }
}
const canPublish = computed(() => stepValid(3) && st.accountIds.length && st.caption.trim() && (st.when === 'now' || st.publishAt))
async function publish () {
  err.value = ''; okMsg.value = ''; publishing.value = true
  try {
    await $fetch('/api/posts', { method: 'POST', body: { action: st.when, content: st.caption, mediaIds: [st.videoMediaId], targets: st.accountIds.map(accountId => ({ accountId })), publishAt: st.when === 'schedule' ? new Date(st.publishAt).toISOString() : undefined } })
    okMsg.value = st.when === 'now' ? '✅ اتنشر — تابع الحالة في التقويم' : '✅ اتجدول'
    localStorage.removeItem(DRAFT_KEY); skipSave = true
  } catch (e) { err.value = e.data?.statusMessage || e.message } finally { publishing.value = false }
}

// ---- draft
const draftPrompt = ref(null); let skipSave = false; let loaded = false
watch(st, () => {
  if (!loaded || draftPrompt.value || skipSave) return
  if (!st.category && !st.items.length) return
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...st, savedAt: Date.now() })) } catch {}
}, { deep: true })
function restoreDraft () {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); delete d.savedAt; Object.assign(st, fresh(), d); st.items.forEach(it => { it.key = ++key; it.stat ||= { value: '', dir: '', label: '' } }) } catch {}
  draftPrompt.value = null
  if (st.jobId && !st.videoMediaId) poll()
}
function discardDraft () { localStorage.removeItem(DRAFT_KEY); draftPrompt.value = null }
onMounted(() => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (d && (d.category || d.items?.length)) draftPrompt.value = { items: d.items?.length || 0, category: d.category, when: d.savedAt ? fmtDate(d.savedAt) : '' }
  } catch {}
  loaded = true
})
onBeforeUnmount(() => clearTimeout(timer))
defineExpose({ st })
</script>
