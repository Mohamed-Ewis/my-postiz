<template>
  <div class="space-y-2" @mouseenter="hover = true" @mouseleave="hover = false">
    <input ref="fileInput" type="file" :accept="accept" class="hidden" @change="onFile">
    <!-- Selected image: thumbnail + remove -->
    <div v-if="current" class="flex items-center gap-3 rounded-xl border p-2 bg-white">
      <img v-if="current.type === 'image'" :src="current.url" class="w-20 h-20 rounded-lg object-cover">
      <img v-else-if="current.thumbUrl" :src="current.thumbUrl" class="w-20 h-20 rounded-lg object-cover">
      <span v-else class="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-2xl">🎞</span>
      <div class="flex-1 min-w-0 text-sm">
        <p class="truncate font-medium">{{ current.name }}</p>
        <button type="button" class="text-brand-600 hover:underline text-xs" @click="fileInput.click()">{{ ui.l('تغيير الصورة', 'Replace') }}</button>
      </div>
      <button type="button" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-600 text-lg leading-none" :title="ui.l('إزالة', 'Remove')" @click="$emit('update:modelValue', null)">×</button>
    </div>
    <!-- Drop zone -->
    <div v-else class="rounded-xl border-2 border-dashed p-4 text-center text-sm transition" :class="dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300'"
      @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
      <p v-if="uploading" class="text-slate-500">⏳ {{ ui.l('بيترفع...', 'Uploading...') }}</p>
      <template v-else>
        <button type="button" class="btn text-sm" @click="fileInput.click()">⬆️ {{ ui.l('ارفع صورة من جهازك', 'Upload from your device') }}</button>
        <p class="text-xs text-slate-500 mt-2">{{ ui.l('أو اسحب الصورة وافلتها هنا، أو الصقها (Ctrl+V)', 'or drag & drop it here, or paste it (Ctrl+V)') }}</p>
      </template>
    </div>
    <MediaPicker :model-value="modelValue" :items="items" :types="types" uploadable :placeholder="ui.l('أو اختار من المكتبة', 'or pick from the library')" @update:model-value="$emit('update:modelValue', $event)" @request-upload="fileInput.click()" />
    <p v-if="uploadError" class="text-xs text-red-600">{{ uploadError }}</p>
  </div>
</template>
<script setup>
// Image/video field with direct upload (button, drag & drop, clipboard paste) that saves to the media
// library and selects the new item immediately. `globalPaste` lets Ctrl+V work anywhere on the page.
const props = defineProps({ modelValue: String, items: { type: Array, default: () => [] }, types: { type: Array, default: () => ['image'] }, globalPaste: Boolean })
const emit = defineEmits(['update:modelValue', 'uploaded'])
const ui = useUiStore()
const fileInput = ref(null); const dragging = ref(false); const hover = ref(false)
const { uploading, uploadError, uploadFile } = useMediaUpload()
const accept = computed(() => props.types.map(t => t === 'image' ? 'image/*' : t === 'video' ? 'video/*' : 'audio/*').join(','))
const current = computed(() => props.items.find(m => m.id === props.modelValue))
const okType = f => props.types.some(t => f.type.startsWith(t === 'other' ? 'audio' : t))
async function handle (file) {
  if (!file) return
  if (!okType(file)) { uploadError.value = ui.l('نوع الملف ده مش مدعوم هنا', 'This file type is not supported here'); return }
  const m = await uploadFile(file)
  if (m) { emit('uploaded', m); emit('update:modelValue', m.id) }
}
function onFile (e) { handle(e.target.files?.[0]); e.target.value = '' }
function onDrop (e) { dragging.value = false; handle(e.dataTransfer.files?.[0]) }
function onPaste (e) {
  if (!props.globalPaste && !hover.value) return
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !hover.value) return
  const item = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file')
  if (!item) return
  e.preventDefault(); handle(item.getAsFile())
}
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>
