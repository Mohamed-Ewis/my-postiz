<template>
  <div class="flex flex-wrap items-center gap-2">
    <span v-for="s in modelValue" :key="s" class="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-sm" dir="ltr">
      {{ s }}<button type="button" class="text-xs" @click="remove(s)">✕</button>
    </span>
    <input v-model="time" type="time" class="rounded-lg border px-2 py-1 text-sm">
    <button type="button" class="rounded-lg border px-2 py-1 text-sm hover:bg-slate-50" @click="add">+</button>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue'])
const time = ref('')
function add () { if (time.value && !props.modelValue.includes(time.value)) emit('update:modelValue', [...props.modelValue, time.value].sort()); time.value = '' }
function remove (s) { emit('update:modelValue', props.modelValue.filter(x => x !== s)) }
</script>
