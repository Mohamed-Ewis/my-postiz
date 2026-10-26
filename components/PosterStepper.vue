<template>
  <div class="space-y-4" dir="rtl">
    <!-- Draft restore -->
    <div v-if="draftPrompt" class="card flex flex-wrap items-center gap-3 bg-amber-50 border-amber-200">
      <span class="font-semibold">📝 تكملة المسودة؟</span>
      <span class="text-sm text-slate-600">{{ draftPrompt.mode === 'carousel' ? 'كاروسيل' : 'بوستر' }} · {{ draftPrompt.items }} خبر · {{ catOf(draftPrompt.category).label }} · آخر حفظ {{ draftPrompt.when }}</span>
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
    <div v-if="st.step === 1" class="space-y-4">
      <div class="card space-y-3">
        <h2 class="font-semibold">١. هتعمل إيه؟</h2>
        <div class="grid md:grid-cols-2 gap-3">
          <button v-for="m in modes" :key="m.key" type="button" class="rounded-2xl border-2 p-4 text-start transition" :class="st.mode === m.key ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'" @click="setMode(m.key)">
            <div class="flex items-center gap-2"><span class="text-2xl">{{ m.icon }}</span><span class="font-bold text-lg">{{ m.label }}</span><span v-if="st.mode === m.key" class="ms-auto">✓</span></div>
            <p class="text-xs text-slate-500 mt-1">{{ m.hint }}</p>
          </button>
        </div>
      </div>
      <div class="card space-y-3">
        <h2 class="font-semibold">٢. اختار الفئة</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button v-for="c in cats" :key="c.key" type="button" class="rounded-2xl border-2 p-3 text-start transition"
            :style="st.category === c.key ? { borderColor: c.color, background: c.color + '14' } : {}" :class="st.category === c.key ? '' : 'border-slate-200 hover:border-slate-300'"
            @click="setCategory(c.key)">
            <div class="flex items-center gap-2"><span class="w-4 h-4 rounded-full" :style="{ background: c.color }" /><span class="font-bold">الكل {{ c.label }}</span><span v-if="st.category === c.key" class="ms-auto">✓</span></div>
          </button>
        </div>
      </div>
      <div v-if="st.category" class="card space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold">٣. اختار القالب</h2>
          <div class="flex gap-1 ms-auto text-sm"><button v-for="s in ['4:5', '1:1', '9:16']" :key="s" class="rounded-lg border px-3 py-1" :class="st.size === s ? 'bg-brand-600 text-white' : ''" @click="st.size = s">{{ s }}</button></div>
        </div>
        <p class="text-xs text-slate-500">لون البراند واللوجو (فوق على اليمين) بيتظبطوا لوحدهم حسب الفئة.</p>
        <h3 class="text-sm font-semibold text-slate-600">القوالب الأساسية</h3>
        <div class="flex gap-3 overflow-x-auto pb-2">
          <button v-for="t in baseTemplates" :key="t.id" type="button" class="shrink-0 w-28 text-start" @click="pickTemplate(t.id)">
            <div class="rounded-lg overflow-hidden ring-2 bg-slate-100 aspect-[4/5]" :class="st.templateId === t.id && !st.presetId ? 'ring-brand-600' : 'ring-transparent hover:ring-slate-300'">
              <img v-if="thumbs[t.id]" :src="thumbs[t.id]" class="w-full h-full object-cover"><span v-else class="flex h-full items-center justify-center text-xs text-slate-400">⏳</span>
            </div>
            <span class="block text-xs mt-1 truncate">{{ t.name?.ar || t.name?.en || t.id }}</span>
          </button>
        </div>
        <h3 class="text-sm font-semibold text-slate-600">تصميمات جاهزة وقوالبك ⭐</h3>
        <div class="flex gap-3 overflow-x-auto pb-2">
          <button v-for="p in presetList" :key="p.id" type="button" class="shrink-0 w-28 text-start" @click="pickPreset(p)">
            <div class="rounded-lg overflow-hidden ring-2 bg-slate-100 aspect-[4/5]" :class="st.presetId === p.id ? 'ring-brand-600' : 'ring-transparent hover:ring-slate-300'"><img :src="p.thumb" loading="lazy" class="w-full h-full object-cover"></div>
            <span class="block text-xs mt-1 truncate">{{ p.builtin ? '' : '⭐ ' }}{{ p.name?.ar || p.name?.en }}</span>
          </button>
          <p v-if="!presetList.length" class="text-sm text-slate-400 p-2">مفيش تصميمات للفئة دي</p>
        </div>
      </div>
    </div>

    <!-- STEP 2 -->
    <div v-if="st.step === 2" class="space-y-4">
      <div class="card flex flex-wrap items-center gap-3 text-sm">
        <span class="font-semibold">{{ st.mode === 'carousel' ? `🎠 كاروسيل: من ${MIN} لـ ${maxItems} أخبار` : '🖼 بوستر واحد: خبر واحد' }}</span>
        <span class="ms-auto flex gap-2">
          <button v-for="s in sources" :key="s.key" class="rounded-xl border-2 px-3 py-1.5" :class="st.source === s.key ? 'border-brand-600 bg-brand-50' : 'border-slate-200'" @click="st.source = s.key">{{ s.icon }} {{ s.label }}</button>
        </span>
      </div>

      <div v-if="st.source === 'ai'" class="card space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold">🤖 أخبار {{ catOf(st.category).label }}</h2>
          <button class="btn !py-1.5 ms-auto" :disabled="searching" @click="searchNews">{{ searching ? '⏳ بيدوّر...' : (results.length ? '🔄 تحديث' : '🔎 هات الأخبار') }}</button>
        </div>
        <p v-for="n in notices" :key="n" class="text-xs rounded-lg bg-amber-50 text-amber-800 px-2 py-1">ℹ️ {{ n }}</p>
        <div v-if="results.length" class="space-y-2 max-h-[28rem] overflow-y-auto">
          <label v-for="(r, i) in results" :key="i" class="flex gap-3 rounded-xl border p-2 cursor-pointer" :class="picked.includes(i) ? 'border-brand-500 bg-brand-50' : ''">
            <input :checked="picked.includes(i)" :type="st.mode === 'single' ? 'radio' : 'checkbox'" name="pick" class="mt-1" :disabled="!picked.includes(i) && st.mode === 'carousel' && picked.length >= roomLeft" @change="togglePick(i)">
            <img v-if="r.imageUrl" :src="r.imageUrl" class="w-16 h-16 rounded-lg object-cover bg-slate-100" referrerpolicy="no-referrer" loading="lazy">
            <span v-else class="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400 text-center">بدون صورة</span>
            <span class="flex-1 min-w-0">
              <span class="block font-semibold text-sm" dir="auto">{{ r.headline || r.title }}</span>
              <span v-if="r.body" class="block text-xs text-slate-600" dir="auto">{{ r.body }}</span>
              <span class="block text-[11px] text-slate-400">{{ r.source }}<template v-if="r.publishedAt"> · {{ fmtDate(r.publishedAt) }}</template> <a v-if="r.url" :href="r.url" target="_blank" rel="noopener" class="text-brand-600" @click.stop>المصدر ↗</a></span>
            </span>
          </label>
        </div>
        <button v-if="results.length" class="btn" :disabled="!picked.length || importing" @click="addPicked">{{ importing ? '⏳ بينزّل الصور...' : st.mode === 'single' ? '✔ استخدم الخبر ده' : `➕ أضف المختار (${picked.length})` }}</button>
      </div>

      <div class="card space-y-3">
        <div class="flex items-center gap-2"><h2 class="font-semibold">{{ st.mode === 'carousel' ? `الشرائح (${st.items.length}/${maxItems})` : 'الخبر' }}</h2>
          <label v-if="st.mode === 'carousel'" class="ms-auto flex items-center gap-1 text-sm"><input v-model="st.cover" type="checkbox"> غلاف «الكل | {{ catOf(st.category).label }}» في الأول</label></div>
        <p v-if="!st.items.length" class="text-sm text-slate-500">لسه مفيش أخبار{{ st.source === 'ai' ? ' — هات أخبار من فوق أو أضف يدوي' : '' }}.</p>
        <div v-for="(it, i) in st.items" :key="it.key" class="rounded-2xl border p-3 space-y-2 bg-white" :class="dragOver === i ? 'ring-2 ring-brand-400' : ''"
          :draggable="st.mode === 'carousel'" @dragstart="dragFrom = i" @dragover.prevent="dragOver = i" @dragleave="dragOver = -1" @drop.prevent="dropOn(i)" @dragend="dragOver = -1">
          <div class="flex items-center gap-2 text-sm">
            <span v-if="st.mode === 'carousel'" class="cursor-grab text-slate-400" title="اسحب لإعادة الترتيب">⠿</span><b>{{ st.mode === 'carousel' ? `شريحة ${i + 1 + (st.cover ? 1 : 0)}` : 'البوستر' }}</b>
            <span v-if="it.source" class="text-xs text-slate-400 truncate">· {{ it.source }}</span>
            <span class="ms-auto flex gap-1">
              <template v-if="st.mode === 'carousel'">
                <button class="rounded-lg border px-2" :disabled="i === 0" title="لفوق" @click="moveItem(i, -1)">▲</button>
                <button class="rounded-lg border px-2" :disabled="i === st.items.length - 1" title="لتحت" @click="moveItem(i, 1)">▼</button>
              </template>
              <button class="rounded-lg border px-2 hover:bg-red-50 hover:text-red-600" title="حذف" @click="st.items.splice(i, 1)">🗑</button>
            </span>
          </div>
          <div class="grid md:grid-cols-[14rem_1fr] gap-3">
            <ImageUploadField v-model="it.mediaId" :items="library" :types="['image']" @uploaded="onUploaded" />
            <div class="space-y-2">
              <textarea v-model="it.headline" class="input font-semibold" rows="2" dir="auto" placeholder="عنوان الخبر *" maxlength="300" />
              <textarea v-model="it.subtitle" class="input" rows="2" dir="auto" placeholder="الوصف (اختياري)" maxlength="400" />
              <input v-model="it.source" class="input" dir="auto" placeholder="المصدر (اختياري)" maxlength="80">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <button class="rounded-lg border px-2 py-1" :disabled="shortening === it.key || !it.headline" @click="shorten(it)">{{ shortening === it.key ? '⏳' : '✂️' }} اختصر بالـ AI</button>
                <span v-if="!it.headline.trim()" class="text-xs text-amber-700">⚠️ محتاج عنوان</span>
                <span v-if="!it.mediaId" class="text-xs text-slate-400">من غير صورة القالب بيستخدم خلفية بلون الفئة</span>
              </div>
            </div>
          </div>
        </div>
        <p v-if="aiMsg" class="text-xs text-amber-700">{{ aiMsg }}</p>
        <button v-if="st.mode === 'carousel' ? st.items.length < maxItems : !st.items.length" class="rounded-xl border px-3 py-2 text-sm hover:border-brand-400" @click="addItem">➕ {{ st.items.length ? 'إضافة خبر آخر' : 'إضافة خبر يدوي' }}</button>
      </div>
    </div>

    <!-- STEP 3 -->
    <div v-if="st.step === 3" class="grid lg:grid-cols-[1fr_24rem] gap-4">
      <div class="card space-y-3 text-sm">
        <div v-if="slides.length > 1" class="flex gap-2 overflow-x-auto pb-1">
          <button v-for="(s, i) in slides" :key="s.id" class="shrink-0 w-20 text-center" @click="st.active = i">
            <div class="rounded-lg overflow-hidden ring-2 bg-slate-100 aspect-[4/5]" :class="st.active === i ? 'ring-brand-600' : 'ring-transparent'"><img v-if="previews[s.id]" :src="previews[s.id]" class="w-full h-full object-cover"></div>
            <span class="text-[11px]">{{ s.cover ? 'الغلاف' : i + 1 }}</span>
          </button>
        </div>
        <template v-if="cur && !cur.cover">
          <h2 class="font-semibold">✏️ تعديل {{ slides.length > 1 ? `الشريحة ${st.active + 1}` : 'البوستر' }}</h2>
          <textarea v-model="cur.item.headline" rows="2" class="input font-semibold" dir="auto" />
          <textarea v-model="cur.item.subtitle" rows="2" class="input" dir="auto" placeholder="الوصف" />
          <div class="grid grid-cols-3 gap-2">
            <input v-model="cur.item.source" class="input" dir="auto" placeholder="المصدر">
            <input v-model="cur.item.stat.value" class="input" dir="ltr" placeholder="رقم بارز (مثلاً 4.5%)">
            <input v-model="cur.item.stat.label" class="input" dir="auto" placeholder="وصف الرقم">
          </div>
          <div class="rounded-xl border p-2 space-y-2">
            <ImageUploadField v-model="cur.item.mediaId" :items="library" :types="['image']" @uploaded="onUploaded" />
            <div v-if="cur.item.mediaId" class="grid grid-cols-2 gap-3">
              <label>↔ مكان الصورة أفقي<input v-model.number="cur.item.focus.x" type="range" min="0" max="1" step="0.05" class="w-full"></label>
              <label>↕ مكان الصورة رأسي<input v-model.number="cur.item.focus.y" type="range" min="0" max="1" step="0.05" class="w-full"></label>
            </div>
          </div>
        </template>
        <p v-else-if="cur?.cover" class="text-slate-500">الغلاف بيتعمل لوحده من اسم الفئة وأول صورة.</p>
        <div class="flex flex-wrap gap-2 pt-2 border-t">
          <button class="rounded-xl border px-3 py-2" :disabled="dl" @click="downloadOne">⬇️ نزّل PNG</button>
          <button v-if="slides.length > 1" class="rounded-xl border px-3 py-2" :disabled="dl" @click="downloadZip">🗜 نزّل الكل ZIP</button>
          <button class="rounded-xl border px-3 py-2" @click="saveAsTemplate">⭐ احفظ التصميم كقالب</button>
          <button class="btn ms-auto" :disabled="exporting" @click="exportAll">{{ exporting ? '⏳ بيجهّز...' : st.mediaIds.length && !stale ? '✓ جاهز — جهّز تاني' : '✅ جهّز للنشر' }}</button>
        </div>
        <p v-if="stale && st.mediaIds.length" class="text-xs text-amber-700">⚠️ في تعديلات بعد آخر تجهيز — اضغط «جهّز للنشر» تاني</p>
        <p v-if="msg" class="text-emerald-700">{{ msg }}</p>
        <p v-if="err" class="text-red-600">{{ err }}</p>
      </div>
      <div class="card !p-3 space-y-2">
        <h3 class="font-semibold text-sm">👁 المعاينة</h3>
        <div class="relative rounded-xl bg-slate-100 overflow-hidden min-h-64 flex items-center justify-center">
          <img v-if="cur && previews[cur.id]" :src="previews[cur.id]" class="w-full h-auto"><span v-else class="text-slate-400 p-10">⏳</span>
          <template v-if="slides.length > 1">
            <button class="absolute right-2 top-1/2 rounded-full bg-white/90 w-8 h-8 shadow" :disabled="st.active === 0" @click="st.active--">›</button>
            <button class="absolute left-2 top-1/2 rounded-full bg-white/90 w-8 h-8 shadow" :disabled="st.active === slides.length - 1" @click="st.active++">‹</button>
            <span class="absolute bottom-2 inset-x-0 text-center text-xs"><span class="rounded-full bg-black/60 text-white px-2">{{ st.active + 1 }} / {{ slides.length }}</span></span>
          </template>
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
            <label v-for="a in accounts" :key="a.id" class="flex items-center gap-2 rounded-xl border px-3 py-1.5 cursor-pointer" :class="[st.accountIds.includes(a.id) ? 'border-brand-600 bg-brand-50' : '', limitOf(a) === 0 ? 'opacity-50' : '']">
              <input v-model="st.accountIds" type="checkbox" :value="a.id" :disabled="limitOf(a) === 0"><img v-if="a.avatar" :src="a.avatar" class="w-5 h-5 rounded-full">{{ a.name }} <span class="text-xs text-slate-400">{{ a.provider }}</span>
              <span v-if="limitOf(a) === 0" class="text-xs text-slate-500">فيديو بس</span>
              <span v-else-if="limitOf(a) < st.mediaIds.length" class="text-xs text-amber-700">أول {{ limitOf(a) }} صور بس</span>
              <span v-if="a.refreshNeeded" class="text-xs text-amber-700">محتاج إعادة ربط</span>
            </label>
            <NuxtLink v-for="p in unconfigured" :key="p.id" to="/accounts" class="flex items-center gap-2 rounded-xl border border-dashed px-3 py-1.5 text-slate-400">{{ p.name }} <span class="text-xs rounded-full bg-amber-100 text-amber-800 px-2">محتاج إعداد</span></NuxtLink>
          </div>
          <p v-if="!accounts.length" class="text-amber-700 mt-1">مفيش حسابات متوصلة — <NuxtLink to="/accounts" class="underline">وصّل حساب</NuxtLink></p>
          <p v-if="st.mode === 'carousel'" class="text-xs text-slate-500 mt-1">الكاروسيل بيتنشر بوست واحد فيه كل الصور: إنستجرام وفيسبوك لحد 10، لينكدإن لحد 9، X لحد 4. تيك توك ويوتيوب فيديو بس.</p>
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
        </div>
        <p v-for="w in warnings" :key="w" class="text-xs text-amber-700">⚠️ {{ w }}</p>
        <p v-if="err" class="text-red-600">{{ err }}</p>
        <p v-if="okMsg" class="text-emerald-700 font-semibold">{{ okMsg }}</p>
      </div>
      <div class="card !p-3 space-y-2">
        <div class="grid grid-cols-2 gap-1">
          <img v-for="s in slides" :key="s.id" :src="previews[s.id]" class="w-full rounded-lg bg-slate-100" :class="slides.length === 1 ? 'col-span-2' : ''">
        </div>
        <p class="text-xs text-slate-500 text-center">{{ st.mode === 'carousel' ? `كاروسيل · ${slides.length} شرائح` : 'بوستر واحد' }}</p>
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
// 4-step poster wizard (mirrors ReelStepper): mode/category/template → news → edit & preview → publish/schedule. Draft autosaves to localStorage.
import { STEPPER_CATS, CAROUSEL_MIN, CAROUSEL_MAX, PROVIDER_IMAGE_LIMIT, designFor } from '~/utils/posterStepper.js'
const props = defineProps({ library: { type: Array, default: () => [] } })
const emit = defineEmits(['uploaded'])
const DRAFT_KEY = 'mypostiz.posterStepper.v1'
const MIN = CAROUSEL_MIN
const steps = ['النوع والفئة والقالب', 'الأخبار', 'التعديل والمعاينة', 'النشر']
const modes = [{ key: 'single', icon: '🖼', label: 'بوستر واحد', hint: 'خبر واحد = صورة واحدة في بوست' }, { key: 'carousel', icon: '🎠', label: 'كاروسيل', hint: `من ${CAROUSEL_MIN} لـ ${CAROUSEL_MAX} أخبار كشرائح في بوست واحد، بنفس القالب والستايل` }]
const cats = Object.entries(STEPPER_CATS).map(([key, c]) => ({ key, ...c }))
const sources = [{ key: 'manual', icon: '✍️', label: 'يدوي' }, { key: 'ai', icon: '🤖', label: 'تجميع بالـ AI' }]
const catOf = k => STEPPER_CATS[k] ? { key: k, ...STEPPER_CATS[k] } : { label: '' }
let key = Date.now()
const newItem = (o = {}) => ({ key: ++key, mediaId: null, headline: '', subtitle: '', source: '', url: '', focus: { x: 0.5, y: 0.4 }, stat: { value: '', label: '' }, ...o })
const fresh = () => ({ step: 1, mode: '', category: '', templateId: '', presetId: '', size: '4:5', font: undefined, source: 'manual', items: [], cover: true, active: 0, mediaIds: [], exportSig: '', caption: '', captionSig: '', accountIds: [], when: 'now', publishAt: '' })
const st = reactive(fresh())
const library = computed(() => props.library)
function onUploaded (m) { emit('uploaded', m) }
const fmtDate = d => new Date(d).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ---- templates
const { data: tdata } = useFetch('/api/design/templates', { server: false })
const { data: pdata, refresh: refreshPresets } = useFetch('/api/design/presets', { query: { kind: 'poster' }, server: false, default: () => ({ presets: [] }) })
const posterCat = computed(() => STEPPER_CATS[st.category]?.poster)
const baseTemplates = computed(() => (tdata.value?.templates || []).filter(t => t.categories === '*' || t.categories.includes(posterCat.value)))
const presetList = computed(() => (pdata.value?.presets || []).filter(p => !p.data.kind || p.data.kind === 'poster').filter(p => !posterCat.value || !p.data.category || p.data.category === posterCat.value || p.data.category === 'quote'))
const thumbs = reactive({})
async function loadThumbs () {
  const c = st.category; if (!c) return
  for (const t of baseTemplates.value) {
    const k = t.id
    try {
      const blob = await $fetch('/api/design/preview', { method: 'POST', query: { w: 220 }, responseType: 'blob', body: designFor({ ...st, templateId: k }, { headline: `عنوان خبر ${catOf(c).label} هنا`, subtitle: 'تفاصيل قصيرة للخبر' }) })
      if (st.category !== c) return
      if (thumbs[k]) URL.revokeObjectURL(thumbs[k]); thumbs[k] = URL.createObjectURL(blob)
    } catch {}
  }
}
watch(() => [st.category, st.size, baseTemplates.value.length], loadThumbs)
function setCategory (k) { st.category = k; if (!baseTemplates.value.some(t => t.id === st.templateId)) { st.templateId = tdata.value?.defaults?.[STEPPER_CATS[k].poster] || ''; st.presetId = '' } }
function setMode (m) { st.mode = m; if (m === 'single' && st.items.length > 1) st.items.splice(1) }
function pickTemplate (id) { st.templateId = id; st.presetId = ''; st.font = undefined }
function pickPreset (p) { st.templateId = p.data.templateId; st.presetId = p.id; st.size = p.data.size && p.data.size !== '16:9' ? p.data.size : st.size; st.font = p.data.font }

// ---- validation
const maxItems = computed(() => CAROUSEL_MAX - (st.cover ? 1 : 0))
const validItems = computed(() => st.items.filter(it => it.headline.trim()))
function stepValid (n) {
  if (n === 1) return !!(st.mode && st.category && st.templateId)
  if (n === 2) return stepValid(1) && validItems.value.length === st.items.length && (st.mode === 'single' ? st.items.length === 1 : st.items.length >= MIN && st.items.length <= maxItems.value)
  if (n === 3) return stepValid(2) && st.mediaIds.length > 0 && !stale.value
  return false
}
const canOpen = n => n === 1 || stepValid(n - 1)
const blockMsg = computed(() => {
  if (st.step === 1 && !stepValid(1)) return !st.mode ? 'اختار بوستر واحد ولا كاروسيل' : !st.category ? 'اختار الفئة' : 'اختار القالب'
  if (st.step === 2 && !stepValid(2)) return st.items.some(i => !i.headline.trim()) ? 'كل خبر محتاج عنوان' : st.mode === 'single' ? 'محتاج خبر واحد' : st.items.length > maxItems.value ? `أقصى حاجة ${maxItems.value} أخبار` : `الكاروسيل محتاج ${MIN} أخبار على الأقل`
  if (st.step === 3 && !stepValid(3)) return 'اضغط «جهّز للنشر»'
  return ''
})
function go (n) { if (n < st.step || canOpen(n)) { st.step = n; err.value = ''; if (n === 3) { st.active = Math.min(st.active, slides.value.length - 1); refreshPreviews() } if (n === 4) { makeCaption(false); refreshPreviews() } } }

// ---- items
function addItem () { st.items.push(newItem()) }
function moveItem (i, d) { const s = st.items.splice(i, 1)[0]; st.items.splice(i + d, 0, s) }
const dragFrom = ref(-1); const dragOver = ref(-1)
function dropOn (i) { if (dragFrom.value >= 0 && dragFrom.value !== i) { const s = st.items.splice(dragFrom.value, 1)[0]; st.items.splice(i, 0, s) } dragFrom.value = dragOver.value = -1 }
const shortening = ref(null); const aiMsg = ref('')
async function shorten (it) {
  shortening.value = it.key; aiMsg.value = ''
  try { const r = await $fetch('/api/video/news-ai', { method: 'POST', body: { action: 'shorten', title: it.headline, body: it.subtitle } }); if (r.ai === false && r.notice) aiMsg.value = r.notice; else { it.headline = r.title; it.subtitle = r.body } } catch (e) { aiMsg.value = e.data?.statusMessage || e.message } finally { shortening.value = null }
}

// ---- AI news search
const results = ref([]); const picked = ref([]); const notices = ref([]); const searching = ref(false); const importing = ref(false)
const roomLeft = computed(() => st.mode === 'single' ? 1 : Math.max(0, maxItems.value - st.items.length))
function togglePick (i) {
  if (st.mode === 'single') { picked.value = [i]; return }
  picked.value = picked.value.includes(i) ? picked.value.filter(x => x !== i) : picked.value.length < roomLeft.value ? [...picked.value, i] : picked.value
}
async function searchNews () {
  searching.value = true; notices.value = []
  try {
    const r = await $fetch('/api/video/news-search', { method: 'POST', body: { category: st.category, lang: 'ar' } })
    results.value = r.items; notices.value = r.notices || []; picked.value = []
  } catch (e) { notices.value = [e.data?.statusMessage || e.message] } finally { searching.value = false }
}
async function addPicked () {
  importing.value = true
  try {
    const chosen = picked.value.map(i => results.value[i])
    const { media } = await $fetch('/api/video/news-ai', { method: 'POST', body: { action: 'import', items: chosen.map(c => ({ imageUrl: c.imageUrl, title: c.title })) } })
    if (st.mode === 'single') st.items.splice(0)
    chosen.forEach((c, k) => { if (media[k]) emit('uploaded', media[k]); st.items.push(newItem({ headline: c.headline || c.title, subtitle: c.body || '', mediaId: media[k]?.id || null, source: c.source, url: c.url })) })
    results.value = results.value.filter((_, i) => !picked.value.includes(i)); picked.value = []
  } catch (e) { notices.value = [e.data?.statusMessage || e.message] } finally { importing.value = false }
}

// ---- slides + live previews
const slides = computed(() => {
  const out = st.items.map(it => ({ id: 'i' + it.key, item: it, design: designFor(st, it) }))
  if (st.mode === 'carousel' && st.cover) out.unshift({ id: 'cover', cover: true, design: designFor(st, null) })
  return out
})
const cur = computed(() => slides.value[st.active] || slides.value[0])
const previews = reactive({}); const previewSig = {}
let pTimer = null
async function renderPreview (s) {
  const sg = JSON.stringify(s.design)
  if (previewSig[s.id] === sg) return
  previewSig[s.id] = sg
  try {
    const blob = await $fetch('/api/design/preview', { method: 'POST', body: s.design, query: { w: 540 }, responseType: 'blob' })
    if (previewSig[s.id] !== sg) return
    if (previews[s.id]) URL.revokeObjectURL(previews[s.id]); previews[s.id] = URL.createObjectURL(blob)
  } catch (e) { previewSig[s.id] = ''; err.value = e.data?.statusMessage || e.message }
}
async function refreshPreviews () { for (const s of slides.value) await renderPreview(s) }
watch(() => JSON.stringify(slides.value.map(s => s.design)), () => { if (st.step < 3) return; clearTimeout(pTimer); pTimer = setTimeout(refreshPreviews, 350) })

const exportBody = () => ({ category: st.category, mode: st.mode, cover: st.cover, templateId: st.templateId, size: st.size, font: st.font, items: st.items.map(({ key: _k, url: _u, ...it }) => it) })
const sig = computed(() => JSON.stringify(exportBody()))
const stale = computed(() => !!st.exportSig && st.exportSig !== sig.value)
const exporting = ref(false); const err = ref(''); const msg = ref(''); const dl = ref(false)
async function exportAll () {
  exporting.value = true; err.value = ''; msg.value = ''
  const s = sig.value
  try { const r = await $fetch('/api/design/stepper-export', { method: 'POST', body: exportBody() }); st.mediaIds = r.media.map(m => m.id); st.exportSig = s; r.media.forEach(m => emit('uploaded', m)); msg.value = `✓ اتجهّز ${r.media.length} صورة واتحفظت في المكتبة` } catch (e) { err.value = e.data?.statusMessage || e.message } finally { exporting.value = false }
}
function saveBlob (blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
async function downloadOne () {
  dl.value = true; err.value = ''
  try { saveBlob(await $fetch('/api/design/preview', { method: 'POST', body: cur.value.design, query: { w: 1080 }, responseType: 'blob' }), `alkol-${st.category}-${st.active + 1}.png`) } catch (e) { err.value = e.data?.statusMessage || e.message } finally { dl.value = false }
}
async function downloadZip () {
  dl.value = true; err.value = ''
  try { saveBlob(await $fetch('/api/design/stepper-zip', { method: 'POST', body: exportBody(), responseType: 'blob' }), `alkol-${st.category}.zip`) } catch (e) { err.value = e.data?.statusMessage || e.message } finally { dl.value = false }
}
async function saveAsTemplate () {
  const n = prompt('اسم القالب', `الكل ${catOf(st.category).label}`)
  if (!n) return
  const d = cur.value.design
  try { await $fetch('/api/design/presets', { method: 'POST', body: { name: n, kind: 'poster', data: { ...d, focus: d.focus || { x: 0.5, y: 0.4 }, stat: d.stat || { value: '', label: '' } } } }); await refreshPresets(); msg.value = 'اتحفظ كقالب ⭐' } catch (e) { err.value = e.data?.statusMessage || e.message }
}

// ---- publish
const { data: accData } = useFetch('/api/accounts', { server: false })
const accounts = computed(() => (accData.value?.accounts || []).filter(a => !a.disabled))
const unconfigured = computed(() => (accData.value?.providers || []).filter(p => !p.configured && p.id !== 'mock'))
const limitOf = a => PROVIDER_IMAGE_LIMIT[a.provider] ?? 1
const capBusy = ref(false); const capNote = ref(''); const publishing = ref(false); const okMsg = ref(''); const warnings = ref([])
async function makeCaption (force) {
  const csig = JSON.stringify([st.category, validItems.value.map(i => i.headline)])
  if (!force && st.caption && st.captionSig === csig) return
  capBusy.value = true; capNote.value = ''
  try { const r = await $fetch('/api/video/news-ai', { method: 'POST', body: { action: 'caption', category: st.category, handle: '@alkol', items: validItems.value.map(i => ({ title: i.headline })) } }); st.caption = r.caption; st.captionSig = csig; capNote.value = r.ai ? '✨ مكتوب بالـ AI — عدّل براحتك' : 'كابشن جاهز من العناوين (مفيش مفتاح AI) — عدّل براحتك' } catch (e) { capNote.value = e.data?.statusMessage || e.message } finally { capBusy.value = false }
}
const canPublish = computed(() => stepValid(3) && st.accountIds.length && st.caption.trim() && (st.when === 'now' || st.publishAt))
async function publish () {
  err.value = ''; okMsg.value = ''; warnings.value = []; publishing.value = true
  try {
    const r = await $fetch('/api/design/stepper-publish', { method: 'POST', body: { action: st.when, content: st.caption, mediaIds: st.mediaIds, accountIds: st.accountIds, publishAt: st.when === 'schedule' ? new Date(st.publishAt).toISOString() : undefined } })
    warnings.value = r.warnings || []
    okMsg.value = (st.when === 'now' ? '✅ اتنشر — تابع الحالة في التقويم' : '✅ اتجدول') + (r.postIds.length > 1 ? ` (${r.postIds.length} بوستات حسب حدود كل منصة)` : '')
    localStorage.removeItem(DRAFT_KEY); skipSave = true
  } catch (e) { err.value = e.data?.statusMessage || e.message } finally { publishing.value = false }
}

// ---- draft
const draftPrompt = ref(null); let skipSave = false; let loaded = false
watch(st, () => {
  if (!loaded || draftPrompt.value || skipSave) return
  if (!st.category && !st.items.length && !st.mode) return
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...st, savedAt: Date.now() })) } catch {}
}, { deep: true })
function restoreDraft () {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); delete d.savedAt; Object.assign(st, fresh(), d); st.items.forEach(it => { it.key = ++key; it.stat ||= { value: '', label: '' }; it.focus ||= { x: 0.5, y: 0.4 } }); st.exportSig = st.exportSig && sig.value } catch {}
  draftPrompt.value = null
  if (st.step >= 3) refreshPreviews()
}
function discardDraft () { localStorage.removeItem(DRAFT_KEY); draftPrompt.value = null }
onMounted(() => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (d && (d.category || d.items?.length)) draftPrompt.value = { items: d.items?.length || 0, mode: d.mode, category: d.category, when: d.savedAt ? fmtDate(d.savedAt) : '' }
  } catch {}
  loaded = true
})
onBeforeUnmount(() => clearTimeout(pTimer))
defineExpose({ st })
</script>
