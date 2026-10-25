<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">{{ ui.t(titleKey) }}</h1>
    <div class="card text-slate-500">{{ ui.t('soon') }}</div>
  </div>
</template>
<script setup>
defineProps({ titleKey: { type: String, required: true } })
const ui = useUiStore()
</script>
