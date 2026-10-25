<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">🎬 {{ ui.t('video') }} <span class="text-base font-normal text-slate-500">· {{ ui.l('ريل أخبار «الكل»', 'News reel') }}</span></h1>
    <p v-if="caps && !caps.worker" class="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">⚠️ {{ ui.l('الـ Worker واقف — الفيديو بيترندر جوه الـ Worker. شغّل npm run dev:all', 'Worker is not running — rendering happens in the worker. Run npm run dev:all') }}</p>
    <p v-else-if="caps && caps.ffmpeg === false" class="rounded-xl bg-red-50 text-red-700 p-3 text-sm">FFmpeg {{ ui.l('مش موجود. شغّل npm install تاني أو حط FFMPEG_PATH في .env', 'not found. Re-run npm install or set FFMPEG_PATH') }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div class="xl:col-span-2">
        <ReelStepper :library="library" @uploaded="onUploaded" @rendered="refreshJobs" />
      </div>

      <!-- JOBS -->
      <div class="space-y-3">
        <h2 class="font-semibold text-slate-600">{{ ui.l('الفيديوهات', 'Videos') }}</h2>
        <p v-if="!jobs?.length" class="card text-sm text-slate-500">{{ ui.l('لسه مفيش فيديوهات', 'No videos yet') }}</p>
        <div v-for="j in jobs" :key="j.id" class="card !p-3 space-y-2">
          <div class="flex items-center gap-2 text-sm">
            <span>{{ j.kind === 'ai' ? '✨' : '🎬' }}</span><span class="font-semibold truncate flex-1" dir="auto">{{ j.title }}</span>
            <span class="text-xs rounded-full px-2 py-0.5" :class="jobCls[j.state]">{{ jobLabel(j.state) }}</span>
          </div>
          <div v-if="j.state === 'QUEUED' || j.state === 'RENDERING'">
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-brand-600 transition-all" :style="{ width: j.progress + '%' }" /></div>
            <div class="text-xs text-slate-500 mt-1">{{ j.progress }}% <span v-if="j.stage">· {{ j.stage }}</span></div>
          </div>
          <p v-if="j.error" class="text-xs text-red-600">{{ j.error }}</p>
          <template v-if="j.output">
            <video :src="j.output.url" :poster="j.output.thumbUrl || undefined" controls preload="none" class="w-full max-h-96 rounded-xl bg-black" />
            <div class="flex gap-2 text-sm">
              <NuxtLink :to="`/compose?media=${j.output.id}`" class="btn !py-1.5 flex-1">📤 {{ ui.l('انشر الفيديو ده', 'Post this video') }}</NuxtLink>
              <a :href="j.output.url" download class="rounded-xl border px-3 py-1.5">⬇</a>
            </div>
            <div class="text-xs text-slate-400">{{ j.output.width }}×{{ j.output.height }} · {{ Math.round(j.output.duration || 0) }}s · {{ (j.output.size / 1048576).toFixed(1) }}MB</div>
          </template>
          <button v-if="j.state !== 'RENDERING'" class="text-xs text-slate-400 hover:text-red-600" @click="removeJob(j)">{{ ui.l('حذف من القائمة', 'Remove') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const ui = useUiStore()
const { data: caps } = await useFetch('/api/video/capabilities')
const { data: libData, refresh: refreshLibrary } = await useFetch('/api/media', { default: () => [] })
const { data: jobs, refresh: refreshJobs } = await useFetch('/api/video/jobs', { default: () => [] })
const library = computed(() => libData.value)
function onUploaded (m) { libData.value = [m, ...(libData.value || [])]; refreshLibrary() }
const error = ref('')

const jobCls = { QUEUED: 'bg-slate-100', RENDERING: 'bg-sky-100 text-sky-800', DONE: 'bg-emerald-100 text-emerald-800', ERROR: 'bg-red-100 text-red-700' }
const jobLabel = s => ({ QUEUED: ui.l('في الطابور', 'Queued'), RENDERING: ui.l('بيترندر', 'Rendering'), DONE: ui.l('جاهز', 'Done'), ERROR: ui.l('خطأ', 'Error') }[s])
async function removeJob (j) { try { await $fetch(`/api/video/jobs/${j.id}`, { method: 'DELETE' }); await refreshJobs() } catch (e) { error.value = e.data?.statusMessage || e.message } }

onMounted(() => {
  const t = setInterval(() => { if (jobs.value?.some(j => j.state === 'QUEUED' || j.state === 'RENDERING')) refreshJobs() }, 2000)
  onBeforeUnmount(() => clearInterval(t))
})
</script>
