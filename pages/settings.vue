<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">{{ ui.t('settings') }}</h1>
    <div class="grid lg:grid-cols-2 gap-6">
      <BrandKit />
      <div class="card space-y-3">
        <h2 class="font-semibold">⚙️ {{ ui.l('عام', 'General') }}</h2>
        <label class="block text-sm">{{ ui.l('اللغة', 'Language') }}
          <select v-model="ui.locale" class="input mt-1"><option value="ar">العربية</option><option value="en">English</option></select>
        </label>
        <label class="block text-sm">{{ ui.l('المنطقة الزمنية (للمواعيد الثابتة)', 'Timezone (for posting slots)') }}
          <select v-model="form.timezone" class="input mt-1" dir="ltr"><option v-for="z in zones" :key="z">{{ z }}</option></select>
        </label>
        <div class="text-sm">{{ ui.l('مواعيد افتراضية (لو الحساب مالوش مواعيد)', 'Default slots (when an account has none)') }}
          <div class="mt-1"><SlotEditor v-model="form.defaultSlots" /></div>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <label>YouTube {{ ui.l('خصوصية', 'privacy') }}<select v-model="form.youtubePrivacy" class="input mt-1"><option>public</option><option>unlisted</option><option>private</option></select></label>
          <label>TikTok {{ ui.l('خصوصية', 'privacy') }}<select v-model="form.tiktokPrivacy" class="input mt-1"><option>SELF_ONLY</option><option>MUTUAL_FOLLOW_FRIENDS</option><option>FOLLOWER_OF_CREATOR</option><option>PUBLIC_TO_EVERYONE</option></select></label>
        </div>
        <button class="btn" @click="save">{{ ui.l('حفظ', 'Save') }}</button>
        <span v-if="saved" class="text-sm text-emerald-700 ms-2">✅</span>
      </div>

      <div class="space-y-6">
        <div class="card space-y-2 text-sm">
          <h2 class="font-semibold">🤖 {{ ui.l('الذكاء الاصطناعي', 'AI') }}</h2>
          <div>{{ ui.l('المزود', 'Provider') }}: <b>{{ data?.ai.provider }}</b></div>
          <div>{{ ui.l('موديل النص', 'Text model') }}: <code dir="ltr">{{ data?.ai.textModel }}</code></div>
          <div>{{ ui.l('موديل الصور', 'Image model') }}: <code dir="ltr">{{ data?.ai.imageModel }}</code></div>
          <div>{{ ui.l('المفتاح', 'API key') }}: <span :class="data?.ai.hasKey ? 'text-emerald-700' : 'text-red-600'">{{ data?.ai.hasKey ? ui.l('موجود ✅', 'set ✅') : ui.l('مش موجود في .env ❌', 'missing in .env ❌') }}</span></div>
          <p class="text-xs text-slate-400">{{ ui.l('بيتغير من .env (AI_PROVIDER, GEMINI_MODEL, OPENAI_MODEL...)', 'Change via .env') }}</p>
        </div>
        <div class="card space-y-2 text-sm">
          <h2 class="font-semibold">⏱ Worker</h2>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" :class="data?.worker.alive ? 'bg-emerald-500' : 'bg-red-500'" />
            {{ data?.worker.alive ? ui.l('شغال', 'Running') : ui.l('واقف — شغّل npm run worker أو npm run dev:all', 'Stopped — run npm run worker or npm run dev:all') }}
          </div>
          <div class="text-slate-500">{{ ui.l('آخر نبضة', 'Last heartbeat') }}: {{ data?.worker.lastHeartbeat ? new Date(data.worker.lastHeartbeat).toLocaleString() : '—' }}</div>
        </div>
        <div class="card space-y-2 text-sm">
          <h2 class="font-semibold">🗂 {{ ui.t('media') }}</h2>
          <div>{{ ui.l('فولدر التخزين', 'Folder') }}: <code dir="ltr">{{ data?.media.dir }}</code></div>
          <div>{{ ui.l('الرابط العام (لإنستجرام)', 'Public URL (Instagram)') }}: <code dir="ltr">{{ data?.media.publicBaseUrl || '—' }}</code></div>
          <div>{{ ui.l('أقصى حجم رفع', 'Max upload') }}: {{ data?.media.maxUploadMb }} MB</div>
        </div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <div class="card space-y-3">
        <h2 class="font-semibold">🏷️ {{ ui.l('التاجز', 'Tags') }}</h2>
        <div class="flex flex-wrap gap-2">
          <span v-for="t in tags" :key="t.id" class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm text-white" :style="{ background: t.color }">
            {{ t.name }}<button class="text-xs" @click="delTag(t)">✕</button>
          </span>
        </div>
        <div class="flex gap-2"><input v-model="tagName" class="input" :placeholder="ui.l('اسم التاج', 'Tag name')"><input v-model="tagColor" type="color" class="h-10 w-12 rounded border"><button class="btn" @click="addTag">+</button></div>
      </div>
      <div class="card space-y-3">
        <h2 class="font-semibold">📋 {{ ui.l('القوالب والتوقيعات', 'Templates & signatures') }}</h2>
        <div v-for="t in templates" :key="t.id" class="border rounded-xl p-2 text-sm">
          <div class="flex items-center gap-2"><b>{{ t.kind === 'signature' ? '✍️' : '📄' }} {{ t.name }}</b>
            <button class="ms-auto text-xs" @click="tpl = { ...t }">✏️</button><button class="text-xs text-red-600" @click="delTpl(t)">✕</button></div>
          <p class="text-slate-500 whitespace-pre-wrap line-clamp-2" dir="auto">{{ t.content }}</p>
        </div>
        <div class="space-y-2 border-t pt-3">
          <div class="flex gap-2">
            <input v-model="tpl.name" class="input" :placeholder="ui.l('الاسم', 'Name')">
            <select v-model="tpl.kind" class="input !w-40"><option value="snippet">{{ ui.l('قالب', 'Snippet') }}</option><option value="signature">{{ ui.l('توقيع', 'Signature') }}</option></select>
          </div>
          <textarea v-model="tpl.content" rows="3" class="input" dir="auto" />
          <button class="btn" @click="saveTpl">{{ tpl.id ? ui.l('تعديل', 'Update') : ui.l('إضافة', 'Add') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
const ui = useUiStore()
const { data, refresh } = await useFetch('/api/settings')
const { data: tags, refresh: rTags } = await useFetch('/api/tags', { default: () => [] })
const { data: templates, refresh: rTpl } = await useFetch('/api/templates', { default: () => [] })
const form = reactive({ timezone: 'Africa/Cairo', defaultSlots: [], youtubePrivacy: 'public', tiktokPrivacy: 'SELF_ONLY' })
watchEffect(() => { if (data.value) Object.assign(form, { timezone: data.value.timezone, defaultSlots: [...(data.value.defaultSlots || [])], youtubePrivacy: data.value.youtubePrivacy, tiktokPrivacy: data.value.tiktokPrivacy }) })
const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Africa/Cairo', 'UTC']
const saved = ref(false)
async function save () { await $fetch('/api/settings', { method: 'PUT', body: { ...form, locale: ui.locale } }); saved.value = true; setTimeout(() => (saved.value = false), 1500); refresh() }
const tagName = ref(''); const tagColor = ref('#6366f1')
async function addTag () { if (!tagName.value) return; await $fetch('/api/tags', { method: 'POST', body: { name: tagName.value, color: tagColor.value } }); tagName.value = ''; rTags() }
async function delTag (t) { await $fetch(`/api/tags/${t.id}`, { method: 'DELETE' }); rTags() }
const tpl = ref({ name: '', content: '', kind: 'snippet' })
async function saveTpl () { await $fetch('/api/templates', { method: 'POST', body: tpl.value }); tpl.value = { name: '', content: '', kind: 'snippet' }; rTpl() }
async function delTpl (t) { await $fetch(`/api/templates/${t.id}`, { method: 'DELETE' }); rTpl() }
onMounted(() => { const i = setInterval(refresh, 15000); onBeforeUnmount(() => clearInterval(i)) })
</script>
