<template>
  <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div class="flex items-center gap-2 p-3">
      <div class="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center overflow-hidden">
        <img v-if="account.avatar" :src="account.avatar" class="w-full h-full object-cover">
        <span v-else>{{ PROVIDER_ICONS[account.provider] || '🌐' }}</span>
      </div>
      <div class="text-sm">
        <div class="font-semibold">{{ account.name }}</div>
        <div class="text-xs text-slate-400">{{ account.provider }} · {{ ui.l('دلوقتي', 'Just now') }}</div>
      </div>
    </div>
    <p class="px-3 pb-3 whitespace-pre-wrap text-sm leading-relaxed" dir="auto">{{ text || ui.l('معاينة البوست هتظهر هنا', 'Preview appears here') }}</p>
    <div v-if="media.length" class="grid gap-0.5" :class="media.length > 1 ? 'grid-cols-2' : ''">
      <template v-for="m in media.slice(0, 4)" :key="m.id">
        <video v-if="m.type === 'video'" :src="m.url" class="w-full aspect-square object-cover bg-black" muted controls preload="metadata" />
        <img v-else :src="m.url" class="w-full aspect-square object-cover">
      </template>
    </div>
    <div class="px-3 py-2 text-xs border-t flex gap-2" :class="over && !threaded ? 'text-red-600' : 'text-slate-400'">
      <span dir="ltr">{{ count }} / {{ limit }}</span>
      <span v-if="isX && over && threaded">🧵 {{ ui.l(`هيتقسم لسلسلة من ${parts} تغريدات`, `Will be split into a ${parts}-post thread`) }}</span>
      <span v-else-if="isX && over">{{ ui.l('أطول من حد X — فعّل «قسّمه لسلسلة» من تبويب الحساب', 'Over the X limit — enable “Split into thread” in the account tab') }}</span>
      <span v-if="isX" class="ms-auto" :title="ui.l('الروابط بتتحسب 23 حرف والإيموجي حرفين', 'Links count as 23, emoji as 2')">ⓘ</span>
    </div>
  </div>
</template>
<script setup>
import { PROVIDER_ICONS, CHAR_LIMITS } from '~/utils/postUi.js'
import { xWeightedLength, splitThread } from '~/utils/xText.js'
const props = defineProps({ account: Object, text: { type: String, default: '' }, media: { type: Array, default: () => [] }, settings: { type: Object, default: () => ({}) } })
const isX = computed(() => props.account.provider === 'x')
const count = computed(() => isX.value ? xWeightedLength(props.text) : props.text.length)
const threaded = computed(() => isX.value && !!props.settings?.thread)
const parts = computed(() => threaded.value ? splitThread(props.text).length : 1)
const ui = useUiStore()
const limit = computed(() => CHAR_LIMITS[props.account.provider] || 5000)
const over = computed(() => count.value > limit.value)
</script>
