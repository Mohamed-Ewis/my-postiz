<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ editId ? ui.l('تعديل البوست', 'Edit post') : ui.t('compose') }}</h1>
      <StateBadge v-if="loadedState" :state="loadedState" />
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div class="xl:col-span-3 space-y-4">
        <!-- Accounts -->
        <div class="card">
          <h2 class="font-semibold mb-3">{{ ui.l('انشر على', 'Post to') }}</h2>
          <p v-if="!accounts.length" class="text-slate-500 text-sm">{{ ui.t('noAccounts') }} — <NuxtLink to="/accounts" class="text-brand-600">{{ ui.t('accounts') }}</NuxtLink></p>
          <div class="flex flex-wrap gap-2">
            <button v-for="a in accounts" :key="a.id" type="button" @click="toggleAccount(a.id)"
              class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition"
              :class="selected.includes(a.id) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 opacity-70'">
              <span>{{ PROVIDER_ICONS[a.provider] || '🌐' }}</span>{{ a.name }}
            </button>
          </div>
        </div>

        <!-- Editor with tabs -->
        <div class="card space-y-3">
          <div class="flex gap-1 border-b -mt-2 overflow-x-auto">
            <button type="button" class="px-3 py-2 text-sm border-b-2 -mb-px" :class="tab === 'global' ? 'border-brand-600 text-brand-700 font-semibold' : 'border-transparent text-slate-500'" @click="tab = 'global'">{{ ui.l('النص الأساسي', 'Main text') }}</button>
            <button v-for="a in selectedAccounts" :key="a.id" type="button" class="px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap"
              :class="tab === a.id ? 'border-brand-600 text-brand-700 font-semibold' : 'border-transparent text-slate-500'" @click="tab = a.id">
              {{ PROVIDER_ICONS[a.provider] }} {{ a.name }}<span v-if="overrides[a.id]" class="text-brand-600"> •</span>
            </button>
          </div>
          <template v-if="tab === 'global'">
            <textarea v-model="content" rows="8" dir="auto" class="input resize-y" :placeholder="ui.l('اكتب البوست أو الفكرة هنا...', 'Write your post or idea...')" />
          </template>
          <template v-else>
            <p class="text-xs text-slate-500">{{ ui.l('نص مخصوص للحساب ده (سيبه فاضي عشان يستخدم النص الأساسي)', 'Custom text for this account (leave empty to use main text)') }}</p>
            <textarea v-model="overrides[tab]" rows="8" dir="auto" class="input resize-y" :placeholder="content" />
            <button v-if="overrides[tab]" type="button" class="text-xs text-slate-500 underline" @click="overrides[tab] = ''">{{ ui.l('رجّع للنص الأساسي', 'Reset to main text') }}</button>
            <div v-if="tabProvider === 'youtube'" class="grid sm:grid-cols-2 gap-2">
              <input v-model="tabSettings.title" class="input" maxlength="100" :placeholder="ui.l('عنوان الفيديو (اختياري)', 'Video title (optional)')">
              <select v-model="tabSettings.privacy" class="input"><option value="">{{ ui.l('الخصوصية الافتراضية', 'Default privacy') }}</option><option>public</option><option>unlisted</option><option>private</option></select>
            </div>
            <select v-if="tabProvider === 'tiktok'" v-model="tabSettings.privacy" class="input">
              <option value="">{{ ui.l('الخصوصية الافتراضية', 'Default privacy') }}</option><option>SELF_ONLY</option><option>MUTUAL_FOLLOW_FRIENDS</option><option>FOLLOWER_OF_CREATOR</option><option>PUBLIC_TO_EVERYONE</option>
            </select>
            <label v-if="tabProvider === 'x'" class="flex items-center gap-2 text-sm"><input v-model="tabSettings.thread" type="checkbox"> 🧵 {{ ui.l('لو النص أطول من 280، قسّمه لسلسلة (Thread)', 'If longer than 280, split into a thread') }}</label>
            <label v-if="tabProvider === 'x'" class="flex items-center gap-2 text-sm"><input v-model="tabSettings.longPost" type="checkbox"> {{ ui.l('حسابي X Premium (بوست طويل بدون تقسيم)', 'My account has X Premium (long post, no split)') }}</label>
            <select v-if="tabProvider === 'instagram'" v-model="tabSettings.igType" class="input">
              <option value="">{{ ui.l('بوست / ريلز', 'Feed / Reels') }}</option><option value="STORIES">Story</option>
            </select>
          </template>

          <!-- AI -->
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <select v-model="aiLang" class="rounded-lg border px-2 py-1.5 text-sm">
              <option value="ar">عربي</option><option value="en">English</option>
            </select>
            <button type="button" class="btn !bg-violet-600 hover:!bg-violet-700 !py-1.5 text-sm" :disabled="aiBusy" @click="runAi('caption')">✨ {{ aiBusy === 'caption' ? '...' : ui.l('اكتب كابشن بالـ AI', 'AI caption') }}</button>
            <button type="button" class="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" :disabled="aiBusy" @click="runAi('hashtags')"># {{ aiBusy === 'hashtags' ? '...' : ui.l('هاشتاجات', 'Hashtags') }}</button>
          </div>
          <p v-if="aiError" class="text-sm text-red-600">{{ aiError }}</p>

          <div class="flex flex-wrap items-center gap-2 border-t pt-3">
            <select v-if="templates.length" class="rounded-lg border px-2 py-1.5 text-sm" @change="insertTemplate($event)">
              <option value="">📋 {{ ui.l('إدراج قالب / توقيع', 'Insert template / signature') }}</option>
              <option v-for="tp in templates" :key="tp.id" :value="tp.id">{{ tp.kind === 'signature' ? '✍️' : '📄' }} {{ tp.name }}</option>
            </select>
            <button type="button" class="rounded-lg border px-2 py-1.5 text-sm hover:bg-slate-50" @click="saveAsTemplate">💾 {{ ui.l('احفظ كقالب', 'Save as template') }}</button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-slate-500">🏷️</span>
            <button v-for="tg in tags" :key="tg.id" type="button" class="rounded-full border px-2 py-0.5 text-xs"
              :style="tagIds.includes(tg.id) ? { background: tg.color, color: '#fff', borderColor: tg.color } : { borderColor: tg.color, color: tg.color }"
              @click="tagIds = tagIds.includes(tg.id) ? tagIds.filter(x => x !== tg.id) : [...tagIds, tg.id]">{{ tg.name }}</button>
            <input v-model="newTag" class="rounded-lg border px-2 py-0.5 text-xs w-28" :placeholder="ui.l('تاج جديد', 'New tag')" @keydown.enter.prevent="addTag">
          </div>
          <div>
            <label class="text-sm text-slate-500">💬 {{ ui.l('أول كومنت (اختياري)', 'First comment (optional)') }}</label>
            <textarea v-model="firstComment" rows="2" dir="auto" class="input mt-1" />
          </div>
        </div>

        <!-- Media -->
        <div class="card space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ ui.t('media') }}</h2>
            <div class="flex gap-2">
              <button type="button" class="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" @click="showLibrary = !showLibrary">{{ ui.l('من المكتبة', 'From library') }}</button>
              <label class="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                {{ uploading ? '...' : ui.l('رفع', 'Upload') }}
                <input type="file" multiple accept="image/*,video/*" class="hidden" @change="upload">
              </label>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <input v-model="imgPrompt" class="input flex-1 min-w-48" dir="auto" :placeholder="ui.l('اوصف صورة عايز الـ AI يعملها...', 'Describe an image to generate...')">
            <select v-model="imgAspect" class="rounded-lg border px-2 py-2 text-sm"><option>1:1</option><option>4:5</option><option>16:9</option><option>9:16</option></select>
            <button type="button" class="btn !bg-violet-600 hover:!bg-violet-700 text-sm" :disabled="imgBusy || !imgPrompt" @click="genImage">🎨 {{ imgBusy ? '...' : ui.l('ولّد صورة', 'Generate') }}</button>
          </div>
          <p v-if="imgError" class="text-sm text-red-600">{{ imgError }}</p>
          <div v-if="selectedMedia.length" class="flex flex-wrap gap-2">
            <div v-for="m in selectedMedia" :key="m.id" class="relative w-24 h-24">
              <video v-if="m.type === 'video'" :src="m.url" class="w-full h-full object-cover rounded-xl bg-black" muted preload="metadata" />
              <img v-else :src="m.url" class="w-full h-full object-cover rounded-xl">
              <button type="button" class="absolute top-1 end-1 bg-white/90 rounded-full w-6 h-6 text-xs" @click="toggleMedia(m.id)">✕</button>
            </div>
          </div>
          <div v-if="showLibrary" class="grid grid-cols-4 md:grid-cols-6 gap-2 max-h-72 overflow-y-auto border-t pt-3">
            <button v-for="m in library" :key="m.id" type="button" class="relative aspect-square rounded-xl overflow-hidden ring-2"
              :class="mediaIds.includes(m.id) ? 'ring-brand-500' : 'ring-transparent'" @click="toggleMedia(m.id)">
              <video v-if="m.type === 'video'" :src="m.url" class="w-full h-full object-cover bg-black" muted preload="metadata" />
              <img v-else :src="m.url" class="w-full h-full object-cover">
              <span v-if="m.type === 'video'" class="absolute bottom-1 start-1 text-xs bg-black/60 text-white rounded px-1">▶</span>
            </button>
            <p v-if="!library.length" class="col-span-full text-sm text-slate-500">{{ ui.l('المكتبة فاضية', 'Library is empty') }}</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="card space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="text-sm text-slate-600">{{ ui.l('ميعاد النشر', 'Publish at') }}</label>
            <input v-model="publishAtLocal" type="datetime-local" class="input !w-auto">
            <button type="button" class="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" :disabled="!selected.length" @click="nextSlot">⏭ {{ ui.l('أقرب ميعاد فاضي', 'Next free slot') }}</button>
          </div>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
          <p v-if="notice" class="text-sm text-emerald-700">{{ notice }}</p>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-xl border px-4 py-2 hover:bg-slate-50" :disabled="busy" @click="save('draft')">💾 {{ ui.l('حفظ مسودة', 'Save draft') }}</button>
            <button class="btn !bg-amber-500 hover:!bg-amber-600" :disabled="busy || !publishAtLocal" @click="save('schedule')">📅 {{ ui.l('جدولة', 'Schedule') }}</button>
            <button class="btn" :disabled="busy" @click="save('now')">🚀 {{ ui.l('انشر دلوقتي', 'Post now') }}</button>
            <button v-if="editId && loadedState === 'ERROR'" class="rounded-xl border border-red-300 text-red-700 px-4 py-2" :disabled="busy" @click="retry">🔁 {{ ui.l('إعادة المحاولة', 'Retry') }}</button>
            <button v-if="editId" class="ms-auto text-red-600 text-sm" :disabled="busy" @click="remove">🗑 {{ ui.l('حذف', 'Delete') }}</button>
          </div>
        </div>
      </div>

      <!-- Previews -->
      <div class="xl:col-span-2 space-y-4">
        <div v-if="loadedTargets.length && loadedState !== 'DRAFT'" class="card space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ ui.l('حالة النشر', 'Delivery') }}</h2>
            <button v-if="loadedTargets.some(t => t.state === 'PUBLISHED')" class="text-sm text-brand-600" @click="loadAnalytics">📊 {{ ui.l('الإحصائيات', 'Stats') }}</button>
          </div>
          <div v-for="t in loadedTargets" :key="t.id" class="text-sm border-t pt-2">
            <div class="flex items-center gap-2"><StateBadge :state="t.state" /> {{ t.account.name }}
              <a v-if="t.releaseUrl" :href="t.releaseUrl" target="_blank" class="text-brand-600 ms-auto">↗</a></div>
            <p v-if="t.error" class="text-xs text-red-600 mt-1">{{ t.error }}</p>
            <p v-if="stats[t.id]" class="text-xs text-slate-600 mt-1" dir="ltr">{{ stats[t.id] }}</p>
          </div>
        </div>
        <h2 class="font-semibold text-slate-600">{{ ui.l('المعاينة', 'Preview') }}</h2>
        <p v-if="!selectedAccounts.length" class="card text-sm text-slate-500">{{ ui.l('اختار حساب عشان تشوف المعاينة', 'Select an account to preview') }}</p>
        <ChannelPreview v-for="a in selectedAccounts" :key="a.id" :account="a" :text="overrides[a.id] || content" :media="selectedMedia" :settings="settingsMap[a.id] || {}" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { PROVIDER_ICONS, toLocalInput } from '~/utils/postUi.js'
const ui = useUiStore()
const route = useRoute()
const editId = computed(() => route.query.id || null)

const { data: accData } = await useFetch('/api/accounts')
const { data: libData, refresh: refreshLib } = await useFetch('/api/media')
const accounts = computed(() => (accData.value?.accounts || []).filter(a => !a.disabled))
const library = computed(() => libData.value || [])

const content = ref('')
const selected = ref([])
const overrides = reactive({})
const mediaIds = ref([])
const publishAtLocal = ref('')
const loadedState = ref('')
const tab = ref('global')
const showLibrary = ref(false)
const busy = ref(false)
const uploading = ref(false)
const error = ref('')
const notice = ref('')
const aiLang = ref(ui.locale)
const aiBusy = ref('')
const aiError = ref('')

const { data: tagData, refresh: refreshTags } = await useFetch('/api/tags', { default: () => [] })
const { data: tplData, refresh: refreshTpl } = await useFetch('/api/templates', { default: () => [] })
const tags = computed(() => tagData.value)
const templates = computed(() => tplData.value)
const tagIds = ref([])
const newTag = ref('')
const firstComment = ref('')
const settingsMap = reactive({})
const loadedTargets = ref([])
const stats = reactive({})
const imgPrompt = ref(''); const imgAspect = ref('1:1'); const imgBusy = ref(false); const imgError = ref('')
const tabProvider = computed(() => accounts.value.find(a => a.id === tab.value)?.provider)
const tabSettings = computed(() => (settingsMap[tab.value] ||= {}))

const selectedAccounts = computed(() => accounts.value.filter(a => selected.value.includes(a.id)))
const selectedMedia = computed(() => mediaIds.value.map(id => library.value.find(m => m.id === id)).filter(Boolean))

async function load () {
  if (!editId.value) {
    if (route.query.date) publishAtLocal.value = toLocalInput(route.query.date)
    if (route.query.media) mediaIds.value = String(route.query.media).split(',').filter(Boolean)
    if (route.query.text) content.value = String(route.query.text)
    return
  }
  const p = await $fetch(`/api/posts/${editId.value}`)
  content.value = p.content
  selected.value = p.targets.map(t => t.accountId)
  for (const t of p.targets) overrides[t.accountId] = t.content || ''
  mediaIds.value = p.mediaIds
  tagIds.value = p.tagIds || []
  firstComment.value = p.firstComment || ''
  for (const t of p.targets) settingsMap[t.accountId] = { ...t.settings }
  loadedTargets.value = p.targets
  publishAtLocal.value = p.publishAt ? toLocalInput(p.publishAt) : ''
  loadedState.value = p.state
}
await load()

function toggleAccount (id) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id]
  if (!selected.value.includes(tab.value)) tab.value = 'global'
}
function toggleMedia (id) {
  mediaIds.value = mediaIds.value.includes(id) ? mediaIds.value.filter(x => x !== id) : [...mediaIds.value, id]
}

async function upload (e) {
  uploading.value = true; error.value = ''
  try {
    const fd = new FormData()
    for (const f of e.target.files) fd.append('file', f)
    const created = await $fetch('/api/media', { method: 'POST', body: fd })
    await refreshLib()
    mediaIds.value.push(...created.map(m => m.id))
  } catch (err) { error.value = err.data?.statusMessage || err.message } finally { uploading.value = false; e.target.value = '' }
}

async function runAi (mode) {
  aiError.value = ''; aiBusy.value = mode
  const isTab = tab.value !== 'global'
  const source = (isTab ? overrides[tab.value] : '') || content.value
  const channel = isTab ? accounts.value.find(a => a.id === tab.value)?.provider : ''
  try {
    const { text } = await $fetch('/api/ai/caption', { method: 'POST', body: { text: source, language: aiLang.value, channel, mode } })
    const next = mode === 'hashtags' ? `${source.trim()}\n\n${text}` : text
    if (isTab) overrides[tab.value] = next; else content.value = next
  } catch (err) { aiError.value = err.data?.statusMessage || err.message } finally { aiBusy.value = '' }
}

async function save (action) {
  error.value = ''; notice.value = ''; busy.value = true
  try {
    const body = {
      action,
      content: content.value,
      mediaIds: mediaIds.value,
      publishAt: publishAtLocal.value ? new Date(publishAtLocal.value).toISOString() : null,
      tagIds: tagIds.value,
      firstComment: firstComment.value,
      targets: selected.value.map(id => ({ accountId: id, content: overrides[id] || '', settings: Object.fromEntries(Object.entries(settingsMap[id] || {}).filter(([, v]) => v)) }))
    }
    const p = editId.value
      ? await $fetch(`/api/posts/${editId.value}`, { method: 'PUT', body })
      : await $fetch('/api/posts', { method: 'POST', body })
    loadedState.value = p.state
    loadedTargets.value = p.targets
    if (p.state === 'ERROR') { error.value = p.error; await navigateTo({ query: { id: p.id } }); return }
    notice.value = { draft: ui.l('اتحفظت المسودة ✅', 'Draft saved ✅'), schedule: ui.l('اتجدول ✅', 'Scheduled ✅'), now: ui.l('اتنشر ✅', 'Published ✅') }[action]
    if (action === 'draft') await navigateTo({ query: { id: p.id } })
    else setTimeout(() => navigateTo('/calendar'), 800)
  } catch (err) { error.value = err.data?.statusMessage || err.message } finally { busy.value = false }
}

function insertTemplate (e) {
  const tp = templates.value.find(x => x.id === e.target.value); e.target.value = ''
  if (!tp) return
  const isTab = tab.value !== 'global'
  const cur = isTab ? (overrides[tab.value] || content.value) : content.value
  const next = tp.kind === 'signature' ? `${cur.trimEnd()}\n\n${tp.content}` : (cur ? `${cur}\n${tp.content}` : tp.content)
  if (isTab) overrides[tab.value] = next; else content.value = next
}
async function saveAsTemplate () {
  const name = prompt(ui.l('اسم القالب؟', 'Template name?')); if (!name) return
  const kind = confirm(ui.l('ده توقيع؟ (OK = توقيع، Cancel = قالب عادي)', 'Is it a signature? (OK = signature)')) ? 'signature' : 'snippet'
  await $fetch('/api/templates', { method: 'POST', body: { name, content: content.value, kind } }); await refreshTpl()
}
async function addTag () {
  if (!newTag.value.trim()) return
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899']
  const tg = await $fetch('/api/tags', { method: 'POST', body: { name: newTag.value, color: colors[tags.value.length % colors.length] } })
  await refreshTags(); tagIds.value.push(tg.id); newTag.value = ''
}
async function nextSlot () {
  error.value = ''
  try { const { at } = await $fetch('/api/slots/next', { query: { accounts: selected.value.join(',') } }); publishAtLocal.value = toLocalInput(at) } catch (err) { error.value = err.data?.statusMessage || err.message }
}
async function genImage () {
  imgError.value = ''; imgBusy.value = true
  try { const m = await $fetch('/api/ai/image', { method: 'POST', body: { prompt: imgPrompt.value, aspect: imgAspect.value } }); await refreshLib(); mediaIds.value.push(m.id) } catch (err) { imgError.value = err.data?.statusMessage || err.message } finally { imgBusy.value = false }
}
async function retry () {
  busy.value = true
  try { await $fetch(`/api/posts/${editId.value}/retry`, { method: 'POST' }); await load(); notice.value = ui.l('اتحط في الطابور تاني ✅', 'Re-queued ✅') } finally { busy.value = false }
}
async function loadAnalytics () {
  const list = await $fetch(`/api/posts/${editId.value}/analytics`)
  for (const r of list) stats[r.targetId] = r.data ? Object.entries(r.data).map(([k, v]) => `${k}: ${v ?? '—'}`).join(' · ') : (r.error === 'not_supported' ? ui.l('مش متاح للمنصة دي', 'Not available') : r.error)
}

async function remove () {
  if (!confirm(ui.l('متأكد إنك عايز تحذف البوست؟', 'Delete this post?'))) return
  await $fetch(`/api/posts/${editId.value}`, { method: 'DELETE' })
  await navigateTo('/calendar')
}
</script>
