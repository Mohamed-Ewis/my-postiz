<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">🖼️ {{ ui.t('poster') }}</h1>
    <PosterStepper :library="lib" @uploaded="onUploaded" />
  </div>
</template>
<script setup>
const ui = useUiStore()
const { data: lib, refresh: refreshLib } = await useFetch('/api/media', { default: () => [] })
// Show the new upload in the picker right away, then sync with the server list.
function onUploaded (m) { lib.value = [m, ...(lib.value || []).filter(x => x.id !== m.id)]; refreshLib() }
</script>
