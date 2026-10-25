<template>
  <div class="card space-y-3 lg:col-span-2">
    <h2 class="font-semibold">🎨 {{ ui.t('brand') }}</h2>
    <p class="text-sm text-slate-500">{{ ui.l('بتتطبق على كل البوسترات والفيديوهات والأخبار التلقائية.', 'Applied to every poster, video and auto-feed.') }}</p>
    <div class="grid md:grid-cols-3 gap-4 text-sm">
      <label>{{ ui.l('اللوجو (للخلفيات الغامقة — PNG شفاف)', 'Logo (for dark backgrounds — transparent PNG)') }}
        <MediaPicker v-model="b.logoMediaId" class="mt-1" :items="lib" :types="['image']" :placeholder="ui.l('اختار من المكتبة', 'Pick from library')" />
      </label>
      <label>{{ ui.l('لوجو للخلفيات الفاتحة (اختياري)', 'Logo for light backgrounds (optional)') }}
        <MediaPicker v-model="b.logoDarkMediaId" class="mt-1" :items="lib" :types="['image']" :placeholder="ui.l('لو فاضي هنلوّن اللوجو غامق', 'If empty the logo is tinted dark')" />
      </label>
      <label>{{ ui.l('الخط', 'Font') }}
        <select v-model="b.font" class="input mt-1"><option v-for="(f, k) in fonts" :key="k" :value="k">{{ f }}</option></select>
      </label>
      <label>{{ ui.l('اللون الأساسي (الغامق)', 'Primary (dark)') }}<div class="flex gap-2 mt-1"><input v-model="b.primary" type="color" class="h-9 w-12 rounded"><input v-model="b.primary" class="input" dir="ltr"></div></label>
      <label>{{ ui.l('اللون الثانوي (الفاتح)', 'Secondary (light)') }}<div class="flex gap-2 mt-1"><input v-model="b.secondary" type="color" class="h-9 w-12 rounded"><input v-model="b.secondary" class="input" dir="ltr"></div></label>
      <label>{{ ui.l('لون مميز ثابت (فاضي = لون التصنيف)', 'Fixed accent (empty = category colour)') }}<div class="flex gap-2 mt-1"><input :value="b.accent || '#e0212e'" type="color" class="h-9 w-12 rounded" @input="b.accent = $event.target.value"><input v-model="b.accent" class="input" dir="ltr" placeholder="#RRGGBB"></div></label>
      <label class="flex items-center gap-2"><input v-model="b.showMark" type="checkbox"> {{ ui.l('إظهار علامة «الكل» + اسم القسم (بدل اللوجو)', 'Show the «الكل» category mark (replaces logo)') }}</label>
      <label>{{ ui.l('الهاندل', 'Handle') }}<input v-model="b.handle" class="input mt-1" dir="ltr" placeholder="@mybrand"></label>
      <label>{{ ui.l('الموقع', 'Website') }}<input v-model="b.website" class="input mt-1" dir="ltr" placeholder="mybrand.com"></label>
      <label>{{ ui.l('لغة القوالب الافتراضية', 'Default template language') }}<select v-model="b.lang" class="input mt-1"><option value="ar">العربية</option><option value="en">English</option></select></label>
    </div>
    <button class="btn" @click="save">{{ saved ? '✓' : ui.l('حفظ الهوية', 'Save brand kit') }}</button>
  </div>
</template>
<script setup>
const ui = useUiStore()
const { data } = await useFetch('/api/brand')
const { data: lib } = await useFetch('/api/media', { default: () => [] })
const { data: cat } = await useFetch('/api/design/templates')
const fonts = computed(() => cat.value?.fonts || { plex: 'IBM Plex Sans Arabic' })
const b = reactive({ primary: '#0B0F17', secondary: '#F6F4EF', accent: '', font: 'plex', handle: '', website: '', lang: 'ar', logoMediaId: null, logoDarkMediaId: null, showMark: true })
watchEffect(() => { if (data.value) Object.assign(b, data.value) })
const saved = ref(false)
async function save () { Object.assign(b, await $fetch('/api/brand', { method: 'PUT', body: b })); saved.value = true; setTimeout(() => (saved.value = false), 1500) }
</script>
