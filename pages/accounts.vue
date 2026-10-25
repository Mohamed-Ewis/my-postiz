<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">{{ ui.t('accounts') }}</h1>
    <p v-if="route.query.error" class="rounded-xl bg-red-50 text-red-700 p-3">{{ route.query.error }}</p>
    <p v-if="route.query.connected" class="rounded-xl bg-emerald-50 text-emerald-700 p-3">✅ {{ ui.l('تم الربط', 'Connected') }}: {{ route.query.connected }}</p>

    <div class="card">
      <h2 class="font-semibold mb-3">{{ ui.t('connected') }}</h2>
      <p v-if="!data?.accounts?.length" class="text-slate-500">{{ ui.t('noAccounts') }}</p>
      <div v-for="a in data?.accounts" :key="a.id" class="py-4 border-b last:border-0 space-y-2">
        <div class="flex flex-wrap items-center gap-3">
          <img v-if="a.avatar" :src="a.avatar" class="w-9 h-9 rounded-full object-cover">
          <span v-else class="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center">{{ PROVIDER_ICONS[a.provider] || '🌐' }}</span>
          <div>
            <div class="font-semibold">{{ a.name }} <span v-if="a.username" class="text-slate-400 font-normal">@{{ a.username }}</span></div>
            <div class="text-xs text-slate-500">{{ a.provider }}<span v-if="a.tokenExpiresAt"> · {{ ui.l('التوكن ينتهي', 'token expires') }} {{ new Date(a.tokenExpiresAt).toLocaleDateString() }}</span></div>
          </div>
          <span v-if="a.refreshNeeded" class="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">{{ ui.l('محتاج إعادة ربط', 'Needs reconnect') }}</span>
          <span v-if="a.disabled" class="text-xs rounded-full bg-slate-200 px-2 py-0.5">{{ ui.l('متوقف', 'Disabled') }}</span>
          <div class="ms-auto flex gap-2 text-sm">
            <a :href="`/api/accounts/${a.provider}/connect`" class="rounded-lg border px-2 py-1 hover:bg-slate-50" :class="a.refreshNeeded ? 'border-red-400 text-red-700' : ''">🔄 {{ ui.l('إعادة ربط', 'Reconnect') }}</a>
            <button class="rounded-lg border px-2 py-1 hover:bg-slate-50" @click="update(a, { disabled: !a.disabled })">{{ a.disabled ? ui.l('تفعيل', 'Enable') : ui.l('إيقاف', 'Disable') }}</button>
            <button class="rounded-lg border px-2 py-1 text-red-600 hover:bg-red-50" @click="remove(a)">🗑</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-slate-500">⏰ {{ ui.l('مواعيد النشر:', 'Posting times:') }}</span>
          <SlotEditor :model-value="a.postingTimes" @update:model-value="v => update(a, { postingTimes: v })" />
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="font-semibold mb-3">{{ ui.t('available') }}</h2>
      <div class="grid md:grid-cols-2 gap-3">
        <div v-for="p in data?.providers" :key="p.id" class="rounded-2xl border p-4 space-y-2" :class="p.configured ? '' : 'bg-slate-50'">
          <div class="flex items-center gap-2">
            <span class="text-xl">{{ PROVIDER_ICONS[p.id] || '🌐' }}</span>
            <span class="font-semibold">{{ p.name }}</span>
            <a v-if="p.configured" :href="`/api/accounts/${p.id}/connect`" class="btn ms-auto !py-1.5 text-sm">{{ ui.t('connect') }}</a>
            <span v-else class="ms-auto text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">{{ ui.l('محتاج إعداد', 'Needs setup') }}</span>
          </div>
          <template v-if="!p.configured">
            <p v-if="p.guide" class="text-sm text-slate-600">{{ ui.locale === 'ar' ? p.guide.ar : p.guide.en }}</p>
            <div class="text-xs text-slate-500">{{ ui.l('حط في .env:', 'Set in .env:') }} <code v-for="v in p.envVars" :key="v" class="bg-white border rounded px-1 mx-0.5" dir="ltr">{{ v }}</code></div>
            <div class="text-xs text-slate-500">Redirect URI: <code class="bg-white border rounded px-1 select-all" dir="ltr">{{ p.redirectUri }}</code></div>
            <p class="text-xs text-slate-400">{{ ui.l('بعد ما تعدل .env اقفل السيرفر وشغله تاني.', 'Restart the server after editing .env.') }}</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { PROVIDER_ICONS } from '~/utils/postUi.js'
const ui = useUiStore()
const route = useRoute()
const { data, refresh } = await useFetch('/api/accounts')
async function update (a, body) { await $fetch(`/api/accounts/${a.id}`, { method: 'PUT', body }); await refresh(); refreshNuxtData('layout-accounts') }
async function remove (a) {
  if (!confirm(ui.l(`حذف ${a.name}؟ كل البوستات المرتبطة بيه هتتشال من الحساب ده.`, `Remove ${a.name}?`))) return
  await $fetch(`/api/accounts/${a.id}`, { method: 'DELETE' }); await refresh(); refreshNuxtData('layout-accounts')
}
</script>
