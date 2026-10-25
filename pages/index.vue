<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ ui.t('welcome') }} 👋</h1>
      <NuxtLink to="/compose" class="btn">+ {{ ui.t('compose') }}</NuxtLink>
    </div>
    <div class="grid grid-cols-2 xl:grid-cols-5 gap-4">
      <div class="card"><div class="text-sm text-slate-500">{{ ui.t('statAccounts') }}</div><div class="text-3xl font-bold mt-2 text-brand-600">{{ data?.accounts ?? 0 }}</div></div>
      <NuxtLink v-for="s in states" :key="s" to="/calendar" class="card hover:shadow-md transition">
        <div class="text-sm text-slate-500">{{ ui.l(STATE_STYLES[s].ar, STATE_STYLES[s].en) }}</div>
        <div class="text-3xl font-bold mt-2" :class="colors[s]">{{ data?.byState?.[s] ?? 0 }}</div>
      </NuxtLink>
    </div>
    <div class="card">
      <h2 class="font-semibold mb-3">{{ ui.l('البوستات الجاية', 'Upcoming posts') }}</h2>
      <p v-if="!data?.upcoming?.length" class="text-slate-500 text-sm">{{ ui.l('مفيش بوستات مجدولة', 'Nothing scheduled') }}</p>
      <NuxtLink v-for="p in data?.upcoming" :key="p.id" :to="`/compose?id=${p.id}`" class="flex justify-between gap-3 py-2 border-b last:border-0 hover:bg-slate-50">
        <span class="truncate" dir="auto">{{ p.content }}</span>
        <span class="text-xs text-slate-500 whitespace-nowrap">{{ p.publishAt && new Date(p.publishAt).toLocaleString(ui.locale === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
<script setup>
import { STATE_STYLES } from '~/utils/postUi.js'
const ui = useUiStore()
const { data } = await useFetch('/api/dashboard')
const states = ['DRAFT', 'QUEUE', 'PUBLISHED', 'ERROR']
const colors = { DRAFT: 'text-slate-600', QUEUE: 'text-amber-500', PUBLISHED: 'text-emerald-600', ERROR: 'text-red-500' }
</script>
