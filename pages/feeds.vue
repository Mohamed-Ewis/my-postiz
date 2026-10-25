<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">📰 {{ ui.t('feeds') }}</h1>
      <button class="btn" @click="edit()">+ {{ ui.l('فيد جديد', 'New feed') }}</button>
    </div>
    <p class="text-sm text-slate-500">{{ ui.l('الـ Worker بيشيك على الفيدات كل كام دقيقة. كل خبر جديد بيتعمل منه بوست (مسودة للمراجعة أو يتجدول على أقرب ميعاد فاضي).', 'The worker polls feeds; each new item becomes a draft or is queued into the next free slot.') }}</p>

    <div v-if="form" class="card space-y-3">
      <div class="grid md:grid-cols-2 gap-3">
        <input v-model="form.name" class="input" :placeholder="ui.l('الاسم', 'Name')">
        <input v-model="form.url" class="input" dir="ltr" placeholder="https://example.com/rss">
        <select v-model="form.type" class="input"><option value="rss">RSS / Atom</option><option value="json">JSON URL</option></select>
        <div class="flex gap-2 items-center"><label class="text-sm text-slate-500 whitespace-nowrap">{{ ui.l('كل (دقيقة)', 'Every (min)') }}</label><input v-model.number="form.intervalMin" type="number" min="5" class="input"></div>
      </div>
      <div v-if="form.type === 'json'" class="grid md:grid-cols-3 gap-2 text-sm" dir="ltr">
        <input v-for="k in ['itemsPath', 'titleField', 'linkField', 'summaryField', 'imageField', 'guidField']" :key="k" v-model="form.config[k]" class="input" :placeholder="k + ' (auto)'">
      </div>
      <div>
        <div class="text-sm text-slate-500 mb-1">{{ ui.l('الحسابات', 'Accounts') }}</div>
        <div class="flex flex-wrap gap-2">
          <label v-for="a in accounts" :key="a.id" class="flex items-center gap-1 rounded-full border px-3 py-1 text-sm cursor-pointer" :class="form.accountIds.includes(a.id) ? 'border-brand-500 bg-brand-50' : ''">
            <input v-model="form.accountIds" type="checkbox" :value="a.id" class="hidden">{{ PROVIDER_ICONS[a.provider] }} {{ a.name }}
          </label>
        </div>
      </div>
      <div class="flex flex-wrap gap-4 text-sm items-center">
        <label class="flex items-center gap-2"><input v-model="form.aiRewrite" type="checkbox"> ✨ {{ ui.l('إعادة صياغة بالـ AI', 'AI rewrite') }}</label>
        <select v-model="form.language" class="rounded-lg border px-2 py-1"><option value="ar">عربي</option><option value="en">English</option></select>
        <select v-model="form.mode" class="rounded-lg border px-2 py-1">
          <option value="draft">{{ ui.l('مسودة للمراجعة', 'Draft for review') }}</option>
          <option value="queue">{{ ui.l('جدولة تلقائية على أقرب ميعاد', 'Auto-queue next free slot') }}</option>
        </select>
        <label class="flex items-center gap-2"><input v-model="form.videoMode" type="checkbox"> 🎬 {{ ui.l('اعمل فيديو قصير لكل خبر', 'Make a short video per item') }}</label>
        <select v-if="form.videoMode" v-model="form.videoAspect" class="rounded-lg border px-2 py-1"><option>9:16</option><option>1:1</option><option>16:9</option></select>
        <select :value="form.config.design?.category || ''" class="rounded-lg border px-2 py-1" @change="setDesignCat($event.target.value)">
          <option value="">🖼️ {{ ui.l('بدون قالب تصميم', 'No design template') }}</option>
          <option v-for="(c, k) in dcat?.categories || {}" :key="k" :value="k">🖼️ {{ c.label[ui.locale] || c.label.en }}</option>
        </select>
        <select v-if="form.config.design?.category" v-model="form.config.design.templateId" class="rounded-lg border px-2 py-1">
          <option v-for="t in feedTemplates" :key="t.id" :value="t.id">{{ t.name[ui.locale] || t.name.en }}</option>
        </select>
        <label class="flex items-center gap-2"><input v-model="form.enabled" type="checkbox"> {{ ui.l('مفعّل', 'Enabled') }}</label>
      </div>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <div class="flex gap-2">
        <button class="btn" @click="save">{{ ui.l('حفظ', 'Save') }}</button>
        <button class="rounded-xl border px-4 py-2" @click="form = null">{{ ui.l('إلغاء', 'Cancel') }}</button>
      </div>
    </div>

    <div v-if="!feeds?.length && !form" class="card text-slate-500">{{ ui.l('مفيش فيدات لسه', 'No feeds yet') }}</div>
    <div v-for="f in feeds" :key="f.id" class="card space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-semibold">{{ f.name }}</span>
        <span class="text-xs rounded-full bg-slate-100 px-2 py-0.5">{{ f.type }}</span>
        <span class="text-xs rounded-full px-2 py-0.5" :class="f.mode === 'queue' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'">{{ f.mode === 'queue' ? ui.l('جدولة تلقائية', 'Auto-queue') : ui.l('مسودات', 'Drafts') }}</span>
        <span v-if="f.videoMode" class="text-xs rounded-full bg-violet-100 text-violet-800 px-2 py-0.5">🎬 {{ f.videoAspect }}</span>
        <span v-if="!f.enabled" class="text-xs rounded-full bg-slate-200 px-2 py-0.5">{{ ui.l('متوقف', 'Disabled') }}</span>
        <div class="ms-auto flex gap-2 text-sm">
          <button class="rounded-lg border px-2 py-1" @click="preview(f)">👁 {{ ui.l('معاينة', 'Preview') }}</button>
          <button class="rounded-lg border px-2 py-1" @click="run(f)">▶ {{ ui.l('شغّل دلوقتي', 'Run now') }}</button>
          <button class="rounded-lg border px-2 py-1" @click="edit(f)">✏️</button>
          <button class="rounded-lg border px-2 py-1 text-red-600" @click="remove(f)">🗑</button>
        </div>
      </div>
      <div class="text-xs text-slate-500" dir="ltr">{{ f.url }}</div>
      <div class="text-xs text-slate-500">{{ ui.l('عناصر متشافة', 'Seen items') }}: {{ f._count.items }} · {{ ui.l('آخر سحب', 'Last fetch') }}: {{ f.lastFetchedAt ? new Date(f.lastFetchedAt).toLocaleString() : '—' }}</div>
      <p v-if="f.lastError" class="text-xs text-red-600">{{ f.lastError }}</p>
      <p v-if="msg[f.id]" class="text-xs text-emerald-700">{{ msg[f.id] }}</p>
      <ul v-if="previews[f.id]" class="text-sm list-disc ps-5 space-y-1">
        <li v-for="it in previews[f.id]" :key="it.guid"><a :href="it.link" target="_blank" class="hover:underline" dir="auto">{{ it.title }}</a></li>
      </ul>
    </div>
  </div>
</template>
<script setup>
const { data: dcat } = await useFetch('/api/design/templates')
const feedTemplates = computed(() => (dcat.value?.templates || []).filter(t => !t.needsStat && (t.categories === '*' || t.categories.includes(form.value?.config?.design?.category))))
function setDesignCat (k) {
  const f = form.value
  if (!k) { delete f.config.design; return }
  f.config.design = { category: k, templateId: dcat.value?.defaults?.[k] || 'editorial-photo' }
}
import { PROVIDER_ICONS } from '~/utils/postUi.js'
const ui = useUiStore()
const { data: feeds, refresh } = await useFetch('/api/feeds')
const { data: accData } = await useFetch('/api/accounts')
const accounts = computed(() => accData.value?.accounts || [])
const form = ref(null)
const error = ref('')
const msg = reactive({})
const previews = reactive({})
function edit (f) {
  error.value = ''
  form.value = f
    ? { ...f, config: { ...f.config }, accountIds: [...f.accountIds] }
    : { name: '', url: '', type: 'rss', config: {}, accountIds: [], aiRewrite: true, language: ui.locale, mode: 'draft', intervalMin: 30, enabled: true, videoMode: false, videoAspect: '9:16' }
}
async function save () {
  error.value = ''
  try { await $fetch('/api/feeds', { method: 'POST', body: form.value }); form.value = null; await refresh() } catch (e) { error.value = e.data?.statusMessage || e.message }
}
async function run (f) {
  msg[f.id] = '...'
  try { const r = await $fetch(`/api/feeds/${f.id}`, { method: 'POST' }); msg[f.id] = ui.l(`اتعمل ${r.created} بوست`, `${r.created} post(s) created`) } catch (e) { msg[f.id] = ''; f.lastError = e.data?.statusMessage || e.message }
  await refresh()
}
async function preview (f) {
  try { previews[f.id] = (await $fetch(`/api/feeds/${f.id}`, { method: 'POST', query: { action: 'preview' } })).items } catch (e) { f.lastError = e.data?.statusMessage || e.message }
}
async function remove (f) { if (confirm(ui.l('حذف الفيد؟', 'Delete feed?'))) { await $fetch(`/api/feeds/${f.id}`, { method: 'DELETE' }); await refresh() } }
</script>
