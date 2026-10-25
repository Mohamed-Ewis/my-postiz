<template>
  <span class="inline-block text-xs rounded-full border px-2 py-0.5" :class="s.cls">{{ ui.locale === 'ar' ? s.ar : s.en }}</span>
</template>
<script setup>
import { STATE_STYLES } from '~/utils/postUi.js'
const props = defineProps({ state: { type: String, required: true } })
const ui = useUiStore()
const s = computed(() => STATE_STYLES[props.state] || STATE_STYLES.DRAFT)
</script>
