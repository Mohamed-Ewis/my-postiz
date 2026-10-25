<template>
  <div class="card space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-semibold">📚 {{ ui.l('قوالب جاهزة', 'Ready templates') }}</h2>
      <div class="flex flex-wrap gap-1 text-xs ms-auto">
        <button class="rounded-full border px-2.5 py-1" :class="!cat ? 'bg-slate-800 text-white' : ''" @click="cat = ''">{{ ui.l('الكل', 'All') }}</button>
        <button v-for="c in cats" :key="c.key" class="rounded-full border px-2.5 py-1 flex items-center gap-1" :class="cat === c.key ? 'bg-slate-800 text-white' : ''" @click="cat = c.key"><span class="w-2 h-2 rounded-full" :style="{ background: c.accent }" />{{ c.label }}</button>
        <select v-if="langs.length > 1" v-model="lang" class="rounded-full border px-2 py-1"><option value="">{{ ui.l('كل اللغات', 'All languages') }}</option><option value="ar">عربي</option><option value="en">English</option></select>
        <button class="rounded-full border px-2.5 py-1" @click="collapsed = !collapsed">{{ collapsed ? ui.l('عرض', 'Show') : ui.l('إخفاء', 'Hide') }}</button>
      </div>
    </div>
    <div v-if="!collapsed" class="flex gap-3 overflow-x-auto pb-2">
      <div v-for="p in shown" :key="p.id" class="shrink-0 w-32 group">
        <button class="block w-full rounded-lg overflow-hidden ring-2 ring-transparent hover:ring-brand-500 bg-slate-100" :class="kind === 'video' ? 'aspect-[9/16]' : 'aspect-[4/5]'" :title="ui.l('استخدم القالب', 'Use preset')" @click="$emit('apply', p)">
          <img :src="p.thumb" loading="lazy" class="w-full h-full object-cover">
        </button>
        <div class="flex items-center gap-1 mt-1 text-xs">
          <span class="truncate flex-1" :title="name(p)">{{ p.builtin ? '' : '⭐ ' }}{{ name(p) }}</span>
          <button :title="ui.l('نسخة', 'Duplicate')" class="opacity-60 hover:opacity-100" @click="dup(p)">⧉</button>
          <template v-if="!p.builtin">
            <button :title="ui.l('إعادة تسمية', 'Rename')" class="opacity-60 hover:opacity-100" @click="rename(p)">✎</button>
            <button :title="ui.l('حذف', 'Delete')" class="opacity-60 hover:opacity-100 text-red-600" @click="del(p)">✕</button>
          </template>
        </div>
      </div>
      <div v-if="!data.presets.length" class="w-full rounded-xl border-2 border-dashed p-6 text-center text-sm text-slate-500">
        <p class="text-2xl mb-1">⭐</p>
        <p>{{ ui.l('لسه مفيش قوالب. اضغط «⭐ احفظ التصميم كقالب».', 'No presets yet. Press “⭐ Save design as preset”.') }}</p>
        <slot name="empty-action" />
      </div>
      <p v-else-if="!shown.length" class="text-sm text-slate-500 p-4">{{ ui.l('مفيش قوالب بالفلتر ده', 'No presets match') }}</p>
    </div>
    <p v-if="!collapsed && hasStarter" class="text-[11px] text-slate-400">{{ ui.l('بعض القوالب فيها صورة بداية من Wikimedia Commons برخصة حرة (اسم المصوّر والرخصة بيظهروا لما تختار القالب). استبدلها بصورتك قبل النشر أو اذكر المصدر.', 'Some presets include a free-licensed Wikimedia Commons starter photo (author and licence shown when selected). Replace it with your own before publishing, or credit it.') }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
  </div>
</template>
<script setup>
import { filterPresets } from '~/utils/presets.js'
const props = defineProps({ kind: { type: String, default: 'poster' } })
defineEmits(['apply'])
const ui = useUiStore()
const { data, refresh } = await useFetch('/api/design/presets', { query: { kind: props.kind }, default: () => ({ presets: [], photos: {} }) })
const { data: dcat } = await useFetch('/api/design/templates')
const cat = ref(''); const lang = ref(''); const collapsed = ref(false); const error = ref('')
const cats = computed(() => Object.entries(dcat.value?.categories || {}).map(([key, c]) => ({ key, accent: c.accent, label: c.label[ui.locale] || c.label.en })))
const shown = computed(() => filterPresets(data.value.presets, { category: cat.value, lang: lang.value }))
const langs = computed(() => [...new Set(data.value.presets.map(p => p.data.lang || 'ar'))])
watch(langs, l => { if (l.length < 2) lang.value = '' })
const hasStarter = computed(() => data.value.presets.some(p => p.data.starterPhoto))
const name = p => p.name[ui.locale] || p.name.en || p.name.ar
const call = async (fn) => { error.value = ''; try { await fn(); await refresh() } catch (e) { error.value = e.data?.statusMessage || e.message } }
const dup = p => call(() => $fetch('/api/design/presets', { method: 'POST', body: { fromId: p.id } }))
function rename (p) { const n = prompt(ui.l('الاسم الجديد', 'New name'), name(p)); if (n) call(() => $fetch(`/api/design/presets/${p.id}`, { method: 'PUT', body: { name: n } })) }
function del (p) { if (confirm(ui.l('تحذف القالب ده؟', 'Delete this preset?'))) call(() => $fetch(`/api/design/presets/${p.id}`, { method: 'DELETE' })) }
async function save (name, data) { await $fetch('/api/design/presets', { method: 'POST', body: { name, kind: props.kind, data } }); await refresh() }
defineExpose({ save, photos: computed(() => data.value.photos), refresh })
</script>
