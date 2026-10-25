<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ ui.t('media') }}</h1>
      <label class="btn cursor-pointer">
        {{ uploading ? '...' : (ui.locale === 'ar' ? 'رفع ملفات' : 'Upload') }}
        <input type="file" multiple accept="image/*,video/*,audio/*" class="hidden" :disabled="uploading" @change="upload">
      </label>
    </div>
    <p v-if="error" class="text-red-600">{{ error }}</p>
    <div v-if="!items?.length" class="card text-slate-500">{{ ui.locale === 'ar' ? 'مفيش ميديا لسه' : 'No media yet' }}</div>
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      <div v-for="m in items" :key="m.id" class="card !p-2 space-y-2">
        <div v-if="m.type === 'other'" class="w-full aspect-square rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-2 p-2"><span class="text-4xl">🎵</span><audio :src="m.url" controls class="w-full" /></div>
        <video v-else-if="m.type === 'video'" :src="m.url" :poster="m.thumbUrl || undefined" controls preload="metadata" class="w-full aspect-square object-cover rounded-xl bg-black" />
        <img v-else :src="m.url" :alt="m.name" class="w-full aspect-square object-cover rounded-xl">
        <div class="flex justify-between items-center text-xs text-slate-500 px-1">
          <span class="truncate">{{ m.name }} · {{ (m.size / 1048576).toFixed(1) }}MB<span v-if="m.duration"> · {{ Math.round(m.duration) }}s</span></span>
          <button class="text-red-500" @click="remove(m)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
const ui = useUiStore()
const { data: items, refresh } = await useFetch('/api/media')
const uploading = ref(false)
const error = ref('')

// Read width/height/duration in the browser so the server needs no ffprobe.
function probe (file) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file)
    const done = v => { URL.revokeObjectURL(url); res(v) }
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video'); v.preload = 'metadata'
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration })
      v.onerror = () => done({}); v.src = url
    } else if (file.type.startsWith('image/')) {
      const i = new Image(); i.onload = () => done({ width: i.naturalWidth, height: i.naturalHeight }); i.onerror = () => done({}); i.src = url
    } else done({})
  })
}

async function upload (e) {
  error.value = ''; uploading.value = true
  try {
    for (const file of e.target.files) {
      const meta = await probe(file)
      const fd = new FormData()
      fd.append('file', file)
      for (const [k, v] of Object.entries(meta)) if (v) fd.append(k, String(v))
      await $fetch('/api/media', { method: 'POST', body: fd })
    }
    await refresh()
  } catch (err) { error.value = err.data?.statusMessage || err.message } finally { uploading.value = false; e.target.value = '' }
}
async function remove (m) {
  await $fetch(`/api/media/${m.id}`, { method: 'DELETE' }); await refresh()
}
</script>
