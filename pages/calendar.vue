<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold">{{ ui.t('calendar') }}</h1>
      <div class="flex rounded-xl border bg-white overflow-hidden text-sm">
        <button v-for="v in views" :key="v.id" class="px-3 py-1.5" :class="view === v.id ? 'bg-brand-600 text-white' : 'hover:bg-slate-50'" @click="view = v.id">{{ ui.l(v.ar, v.en) }}</button>
      </div>
      <div v-if="view !== 'list'" class="flex items-center gap-1">
        <button class="rounded-lg border bg-white px-2 py-1" @click="shift(-1)">{{ ui.locale === 'ar' ? '→' : '←' }}</button>
        <button class="rounded-lg border bg-white px-3 py-1 text-sm" @click="cursor = new Date()">{{ ui.l('النهارده', 'Today') }}</button>
        <button class="rounded-lg border bg-white px-2 py-1" @click="shift(1)">{{ ui.locale === 'ar' ? '←' : '→' }}</button>
      </div>
      <div class="font-semibold text-slate-600">{{ title }}</div>
      <NuxtLink to="/compose" class="btn ms-auto">+ {{ ui.t('compose') }}</NuxtLink>
    </div>

    <!-- Month / Week grid -->
    <div v-if="view !== 'list'" class="card !p-0 overflow-hidden">
      <div class="grid grid-cols-7 border-b bg-slate-50 text-xs text-slate-500">
        <div v-for="d in weekdays" :key="d" class="p-2 text-center">{{ d }}</div>
      </div>
      <div class="grid grid-cols-7">
        <div v-for="day in days" :key="day.key" class="border-b border-e p-1.5 group cursor-pointer hover:bg-slate-50/60"
          :class="[view === 'week' ? 'min-h-[60vh]' : 'min-h-28', day.inMonth ? '' : 'bg-slate-50/50 text-slate-400']"
          @click.self="newAt(day.date)">
          <div class="flex justify-between items-center text-xs mb-1" @click="newAt(day.date)">
            <span :class="day.isToday ? 'bg-brand-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : ''">{{ day.date.getDate() }}</span>
            <span class="opacity-0 group-hover:opacity-100 text-brand-600">+</span>
          </div>
          <NuxtLink v-for="p in day.posts" :key="p.id" :to="`/compose?id=${p.id}`"
            class="block mb-1 rounded-lg border px-1.5 py-1 text-xs truncate" :class="STATE_STYLES[p.state]?.cls">
            <span class="font-semibold">{{ timeOf(p) }}</span>
            <span v-for="t in p.targets" :key="t.id">{{ PROVIDER_ICONS[t.account.provider] }}</span>
            {{ p.content }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- List -->
    <div v-else class="card !p-0">
      <div class="flex gap-2 p-3 border-b text-sm">
        <button v-for="s in ['', 'DRAFT', 'QUEUE', 'PUBLISHED', 'ERROR']" :key="s" class="rounded-full border px-3 py-1"
          :class="filter === s ? 'bg-brand-600 text-white border-brand-600' : ''" @click="filter = s">
          {{ s ? ui.l(STATE_STYLES[s].ar, STATE_STYLES[s].en) : ui.l('الكل', 'All') }}
        </button>
      </div>
      <p v-if="!listPosts.length" class="p-6 text-slate-500">{{ ui.l('مفيش بوستات', 'No posts') }}</p>
      <NuxtLink v-for="p in listPosts" :key="p.id" :to="`/compose?id=${p.id}`" class="flex items-start gap-3 p-4 border-b hover:bg-slate-50">
        <StateBadge :state="p.state" />
        <div class="flex-1 min-w-0">
          <p class="truncate" dir="auto">{{ p.content }}</p>
          <p v-if="p.error" class="text-xs text-red-600 truncate">{{ p.error }}</p>
          <div class="text-xs text-slate-500 mt-1 flex gap-2 flex-wrap">
            <span v-for="t in p.targets" :key="t.id">{{ PROVIDER_ICONS[t.account.provider] }} {{ t.account.name }}
              <a v-if="t.releaseUrl" :href="t.releaseUrl" target="_blank" class="text-brand-600" @click.stop>↗</a></span>
          </div>
        </div>
        <span class="text-xs text-slate-500 whitespace-nowrap">{{ p.publishAt ? fmt(p.publishAt) : '—' }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
import { STATE_STYLES, PROVIDER_ICONS, postDate } from '~/utils/postUi.js'
const ui = useUiStore()
const views = [{ id: 'month', ar: 'شهر', en: 'Month' }, { id: 'week', ar: 'أسبوع', en: 'Week' }, { id: 'list', ar: 'قائمة', en: 'List' }]
const view = useCookie('mp_cal_view', { default: () => 'month' })
const cursor = ref(new Date())
const filter = ref('')
const loc = computed(() => (ui.locale === 'ar' ? 'ar-EG' : 'en-GB'))

const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -((x.getDay() + 1) % 7)) } // week starts Saturday (Egypt)

const range = computed(() => {
  if (view.value === 'week') { const s = startOfWeek(cursor.value); return { from: s, to: addDays(s, 7) } }
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const s = startOfWeek(first)
  return { from: s, to: addDays(s, 42) }
})
const query = computed(() => (view.value === 'list' ? {} : { from: range.value.from.toISOString(), to: range.value.to.toISOString() }))
const { data: posts } = await useFetch('/api/posts', { query, default: () => [] })

const days = computed(() => {
  const out = []; const today = startOfDay(new Date()).getTime()
  for (let d = range.value.from; d < range.value.to; d = addDays(d, 1)) {
    const k = d.getTime()
    out.push({
      key: k, date: d, isToday: k === today,
      inMonth: view.value === 'week' || d.getMonth() === cursor.value.getMonth(),
      posts: posts.value.filter(p => startOfDay(postDate(p)).getTime() === k).sort((a, b) => postDate(a) - postDate(b))
    })
  }
  return out
})
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date()), i).toLocaleDateString(loc.value, { weekday: 'short' })))
const title = computed(() => view.value === 'week'
  ? `${fmtDay(range.value.from)} – ${fmtDay(addDays(range.value.to, -1))}`
  : cursor.value.toLocaleDateString(loc.value, { month: 'long', year: 'numeric' }))
const listPosts = computed(() => [...posts.value].filter(p => !filter.value || p.state === filter.value).sort((a, b) => postDate(b) - postDate(a)))

function shift (n) {
  const d = new Date(cursor.value)
  if (view.value === 'week') d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n, 1)
  cursor.value = d
}
function newAt (date) { const d = new Date(date); d.setHours(10, 0, 0, 0); navigateTo(`/compose?date=${d.toISOString()}`) }
const timeOf = p => (p.publishAt ? new Date(p.publishAt).toLocaleTimeString(loc.value, { hour: '2-digit', minute: '2-digit' }) : '')
const fmt = d => new Date(d).toLocaleString(loc.value, { dateStyle: 'medium', timeStyle: 'short' })
const fmtDay = d => d.toLocaleDateString(loc.value, { day: 'numeric', month: 'short' })
</script>
