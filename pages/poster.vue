<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">🖼️ {{ ui.t('poster') }}</h1>
    <PresetGallery ref="gallery" kind="poster" @apply="applyPreset" />
    <div class="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div class="xl:col-span-3 space-y-4">
        <div class="card space-y-2">
          <h2 class="font-semibold">✨ {{ ui.l('املأ من نص الخبر', 'Fill from news text') }}</h2>
          <textarea v-model="news" rows="3" class="input text-sm" dir="auto" :placeholder="ui.l('الصق نص الخبر وسيب الذكاء الاصطناعي يكتب العنوان والوصف ويختار التصنيف', 'Paste a news text — AI writes the headline, subtitle and picks a category')" />
          <button class="btn !bg-violet-600 hover:!bg-violet-700 text-sm" :disabled="fillBusy || !news" @click="fill">{{ fillBusy ? '...' : ui.l('املأ تلقائيًا', 'Auto-fill') }}</button>
        </div>
        <div class="card space-y-3 text-sm">
          <div><b>{{ ui.l('التصنيف', 'Category') }}</b>
            <div class="flex flex-wrap gap-2 mt-1">
              <button v-for="(c, k) in cat?.categories || {}" :key="k" class="rounded-lg border px-3 py-1 flex items-center gap-1.5" :style="d.category === k ? { borderColor: c.accent, background: c.accent, color: '#fff' } : {}" @click="setCategory(k)"><span class="w-2.5 h-2.5 rounded-full" :style="{ background: d.category === k ? '#fff' : c.accent }" />{{ c.label[ui.locale] || c.label.en }}</button>
            </div>
          </div>
          <div><b>{{ ui.l('القالب', 'Template') }}</b>
            <div class="flex flex-wrap gap-2 mt-1"><button v-for="t in templates" :key="t.id" class="rounded-lg border px-3 py-1" :class="d.templateId === t.id ? 'bg-slate-800 text-white' : ''" @click="d.templateId = t.id">{{ t.name[ui.locale] || t.name.en }}</button></div>
          </div>
          <div class="flex flex-wrap gap-4">
            <div><b>{{ ui.l('المقاس', 'Size') }}</b>
              <div class="flex gap-2 mt-1"><button v-for="s in ['4:5', '1:1', '9:16']" :key="s" class="rounded-lg border px-3 py-1" :class="d.size === s ? 'bg-brand-600 text-white' : ''" @click="d.size = s">{{ s }}</button></div>
            </div>
            <div><b>{{ ui.l('اللغة', 'Language') }}</b>
              <div class="flex gap-2 mt-1"><button v-for="l in ['ar', 'en']" :key="l" class="rounded-lg border px-3 py-1" :class="d.lang === l ? 'bg-brand-600 text-white' : ''" @click="d.lang = l">{{ l === 'ar' ? 'عربي' : 'English' }}</button></div>
            </div>
          </div>
          <label class="block">{{ ui.l('العنوان', 'Headline') }}<textarea v-model="d.headline" rows="2" class="input mt-1" dir="auto" /></label>
          <label class="block">{{ ui.l('الوصف / اسم القائل في الاقتباس', 'Subtitle / quote author') }}<input v-model="d.subtitle" class="input mt-1" dir="auto"></label>
          <div v-if="tpl?.needsStat" class="grid grid-cols-3 gap-2">
            <label>{{ ui.l('الرقم', 'Number') }}<input v-model="d.stat.value" class="input mt-1" dir="ltr" placeholder="4.5%"></label>
            <label class="col-span-2">{{ ui.l('وصف الرقم', 'Number label') }}<input v-model="d.stat.label" class="input mt-1" dir="auto"></label>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label>{{ ui.l('المصدر', 'Source') }}<input v-model="d.source" class="input mt-1" dir="auto"></label>
            <label>{{ ui.l('التاريخ (فاضي = النهارده)', 'Date (empty = today)') }}<input v-model="d.date" class="input mt-1" dir="auto"></label>
          </div>
        </div>
        <div class="card space-y-2 text-sm">
          <b>{{ ui.l('الصورة', 'Image') }}</b>
          <ImageUploadField v-model="d.mediaId" :items="lib" global-paste @uploaded="onUploaded" />
          <div v-if="d.starterPhoto && !d.mediaId && photoCredit" class="flex items-start gap-2 rounded-lg bg-amber-50 text-amber-900 p-2 text-xs">
            <span class="flex-1">📷 {{ ui.l('صورة بداية من القالب (مش صورتك):', 'Preset starter photo (not your own):') }} <a :href="photoCredit.url" target="_blank" rel="noopener" class="underline" dir="ltr">{{ photoCredit.author }} · {{ photoCredit.license }}</a> — {{ ui.l('Wikimedia Commons. استبدلها بصورتك أو اذكر المصدر عند النشر.', 'Wikimedia Commons. Replace it or credit it when publishing.') }}</span>
            <button class="text-base leading-none" :title="ui.l('إزالة', 'Remove')" @click="d.starterPhoto = null">×</button>
          </div>
          <div class="flex gap-2"><input v-model="imgPrompt" class="input" dir="ltr" placeholder="Or generate: AI image prompt (English)"><button class="btn !bg-violet-600 shrink-0" :disabled="imgBusy || !imgPrompt" @click="genImage">🎨 {{ imgBusy ? '...' : 'AI' }}</button></div>
          <div v-if="d.mediaId" class="grid grid-cols-2 gap-3">
            <label>{{ ui.l('نقطة التركيز أفقي', 'Focus X') }}<input v-model.number="d.focus.x" type="range" min="0" max="1" step="0.05" class="w-full"></label>
            <label>{{ ui.l('نقطة التركيز رأسي', 'Focus Y') }}<input v-model.number="d.focus.y" type="range" min="0" max="1" step="0.05" class="w-full"></label>
          </div>
          <p class="text-xs text-slate-400">{{ ui.l('من غير صورة كل قالب بيستخدم خلفية بلون التصنيف. اللوجو والألوان من الإعدادات ← الهوية.', 'Without a photo each template uses a category-coloured background. Logo & colours come from Settings → Brand kit.') }}</p>
        </div>
      </div>
      <div class="xl:col-span-2">
        <div class="card space-y-3 sticky top-4">
          <div class="relative bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center min-h-64">
            <img v-if="previewUrl" :src="previewUrl" class="w-full h-auto" :class="loading ? 'opacity-60' : ''">
            <span v-else class="text-slate-400 p-10">{{ ui.l('اكتب عنوان عشان تشوف المعاينة', 'Type a headline to preview') }}</span>
          </div>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
          <button class="w-full rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" :disabled="!d.headline" @click="saveAsPreset">⭐ {{ ui.l('احفظ التصميم كقالب', 'Save design as preset') }}</button>
          <div class="flex gap-2">
            <button class="btn flex-1" :disabled="busy || !d.headline" @click="exportIt(false)">💾 {{ ui.l('حفظ في المكتبة', 'Save to library') }}</button>
            <button class="btn flex-1 !bg-emerald-600 hover:!bg-emerald-700" :disabled="busy || !d.headline" @click="exportIt(true)">🚀 {{ ui.l('انشره', 'Publish') }}</button>
          </div>
          <p v-if="savedMsg" class="text-sm text-emerald-700">{{ savedMsg }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
const ui = useUiStore()
const router = useRouter()
const { data: cat } = await useFetch('/api/design/templates')
const { data: lib, refresh: refreshLib } = await useFetch('/api/media', { default: () => [] })
const { data: brand } = await useFetch('/api/brand')
const d = reactive({ category: 'politics-economy', templateId: 'split-paper', size: '4:5', lang: brand.value?.lang || ui.locale, headline: '', subtitle: '', source: '', date: '', mediaId: null, focus: { x: 0.5, y: 0.4 }, stat: { value: '', label: '' }, starterPhoto: null, accent: undefined, font: undefined, categories: [] })
const templates = computed(() => (cat.value?.templates || []).filter(t => t.categories === '*' || t.categories.includes(d.category)))
const tpl = computed(() => templates.value.find(t => t.id === d.templateId))
function setCategory (k) { d.category = k; d.categories = []; if (!tpl.value) d.templateId = cat.value?.defaults?.[k] || templates.value[0]?.id }

const previewUrl = ref(''); const loading = ref(false); const error = ref('')
let timer = null; let seq = 0
// Picker changes re-render immediately; typing is debounced.
const gallery = ref(null)
const photoCredit = computed(() => gallery.value?.photos?.[d.starterPhoto])
function applyPreset (p) {
  const x = p.data
  Object.assign(d, { templateId: x.templateId, category: x.category, categories: [...(x.categories || [])], size: x.kind === 'video' ? '9:16' : (x.size || '4:5'), lang: x.lang || 'ar', headline: x.headline || '', subtitle: x.subtitle || '', source: x.source || '', date: x.date || '', mediaId: x.mediaId || null, starterPhoto: x.starterPhoto || null, accent: x.accent, font: x.font, focus: { x: 0.5, y: 0.4, ...(x.focus || {}) }, stat: { value: x.stat?.value || '', label: x.stat?.label || '' } })
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function saveAsPreset () {
  const n = prompt(ui.l('اسم القالب', 'Preset name'), d.headline.slice(0, 40))
  if (!n) return
  try { await gallery.value.save(n, JSON.parse(JSON.stringify(d))); savedMsg.value = ui.l('اتحفظ كقالب ⭐', 'Saved as preset ⭐'); setTimeout(() => (savedMsg.value = ''), 2500) } catch (e) { error.value = e.data?.statusMessage || e.message }
}
watch(() => [d.templateId, d.category, d.size, d.lang, d.mediaId, d.starterPhoto], () => { clearTimeout(timer); preview() })
watch(() => [d.headline, d.subtitle, d.source, d.date, d.stat.value, d.stat.label, d.focus.x, d.focus.y], () => { clearTimeout(timer); timer = setTimeout(preview, 300) })
async function preview () {
  if (!d.headline.trim()) { previewUrl.value = ''; return }
  const my = ++seq; loading.value = true; error.value = ''
  try {
    const blob = await $fetch('/api/design/preview', { method: 'POST', body: JSON.parse(JSON.stringify(d)), query: { t: `${d.templateId}-${d.category}-${d.size}-${d.lang}-${my}` }, responseType: 'blob' })
    if (my !== seq) return
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
  } catch (e) { error.value = e.data?.statusMessage || e.message } finally { if (my === seq) loading.value = false }
}

const news = ref(''); const fillBusy = ref(false)
async function fill () {
  fillBusy.value = true; error.value = ''
  try {
    const r = await $fetch('/api/design/fill', { method: 'POST', body: { text: news.value, lang: d.lang } })
    d.headline = r.headline; d.subtitle = r.subtitle; if (r.source) d.source = r.source
    if (r.category && r.category !== d.category) setCategory(r.category)
    if (r.stat) d.stat = { value: String(r.stat.value), label: r.stat.label || '' }
  } catch (e) { error.value = e.data?.statusMessage || e.message } finally { fillBusy.value = false }
}
const imgPrompt = ref(''); const imgBusy = ref(false)
async function genImage () {
  imgBusy.value = true; error.value = ''
  try { const m = await $fetch('/api/ai/image', { method: 'POST', body: { prompt: imgPrompt.value, aspect: d.size === '9:16' ? '9:16' : d.size === '1:1' ? '1:1' : '3:4' } }); await refreshLib(); d.mediaId = m.id } catch (e) { error.value = e.data?.statusMessage || e.message } finally { imgBusy.value = false }
}
// Show the new upload in the picker right away, then sync with the server list.
function onUploaded (m) { lib.value = [m, ...(lib.value || [])]; refreshLib() }
const busy = ref(false); const savedMsg = ref('')
async function exportIt (publish) {
  busy.value = true; error.value = ''
  try {
    const m = await $fetch('/api/design/export', { method: 'POST', body: d })
    await refreshLib()
    if (publish) return router.push({ path: '/compose', query: { media: m.id, text: [d.headline, d.subtitle].filter(Boolean).join('\n\n') } })
    savedMsg.value = ui.l('اتحفظ في المكتبة ✓', 'Saved to library ✓'); setTimeout(() => (savedMsg.value = ''), 2500)
  } catch (e) { error.value = e.data?.statusMessage || e.message } finally { busy.value = false }
}
</script>
