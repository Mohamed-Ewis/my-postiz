<template>
  <div class="relative">
    <button type="button" class="w-full flex items-center gap-2 rounded-xl border px-2 py-1.5 text-sm bg-white hover:bg-slate-50" @click="open = !open">
      <template v-if="current">
        <img v-if="current.type === 'image'" :src="current.url" class="w-9 h-9 rounded object-cover">
        <img v-else-if="current.thumbUrl" :src="current.thumbUrl" class="w-9 h-9 rounded object-cover">
        <span v-else class="w-9 h-9 rounded bg-slate-100 flex items-center justify-center">{{ current.type === 'video' ? '🎞' : '🎵' }}</span>
        <span class="truncate flex-1 text-start">{{ current.name }}</span>
        <span class="text-slate-400" @click.stop="$emit('update:modelValue', null)">✕</span>
      </template>
      <span v-else class="text-slate-400">{{ placeholder }}</span>
    </button>
    <div v-if="open" class="absolute z-20 mt-1 w-[22rem] max-w-[90vw] max-h-72 overflow-y-auto rounded-xl border bg-white shadow-lg p-2 grid grid-cols-4 gap-2">
      <button v-for="m in filtered" :key="m.id" type="button" class="relative aspect-square rounded-lg overflow-hidden ring-2" :class="m.id === modelValue ? 'ring-brand-500' : 'ring-transparent'" :title="m.name" @click="pick(m)">
        <img v-if="m.type === 'image'" :src="m.url" class="w-full h-full object-cover">
        <img v-else-if="m.thumbUrl" :src="m.thumbUrl" class="w-full h-full object-cover">
        <video v-else-if="m.type === 'video'" :src="m.url" muted preload="metadata" class="w-full h-full object-cover bg-black" />
        <span v-else class="w-full h-full bg-slate-100 flex items-center justify-center text-2xl">🎵</span>
        <span v-if="m.type !== 'image'" class="absolute bottom-0 inset-x-0 text-[10px] bg-black/60 text-white truncate px-1">{{ m.name }}</span>
      </button>
      <div v-if="!filtered.length" class="col-span-4 text-sm text-slate-500 p-3 text-center space-y-2">
        <p>{{ uploadable ? ui.l('المكتبة لسه فاضية — ارفع صورة من جهازك وهتتختار على طول.', 'Your library is empty — upload a file and it will be selected right away.') : empty }}</p>
        <button v-if="uploadable" type="button" class="btn text-sm" @click="$emit('request-upload'); open = false">⬆️ {{ ui.l('ارفع صورة من جهازك', 'Upload from your device') }}</button>
      </div>
      <button v-else-if="uploadable" type="button" class="aspect-square rounded-lg border-2 border-dashed text-slate-500 text-xs flex flex-col items-center justify-center hover:bg-slate-50" @click="$emit('request-upload'); open = false"><span class="text-xl">⬆️</span>{{ ui.l('ارفع', 'Upload') }}</button>
    </div>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: String, items: { type: Array, default: () => [] }, types: { type: Array, default: () => ['image', 'video'] }, placeholder: String, empty: { type: String, default: '—' }, uploadable: Boolean })
const ui = useUiStore()
const emit = defineEmits(['update:modelValue', 'request-upload'])
const open = ref(false)
const filtered = computed(() => props.items.filter(m => props.types.includes(m.type)))
const current = computed(() => props.items.find(m => m.id === props.modelValue))
function pick (m) { emit('update:modelValue', m.id); open.value = false }
</script>
