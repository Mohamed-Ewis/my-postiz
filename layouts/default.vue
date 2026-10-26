<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <div v-if="route.path === '/login'"><slot /></div>
    <div v-else class="flex">
      <aside class="w-64 shrink-0 min-h-screen bg-white border-e border-slate-200 flex flex-col">
        <div class="px-6 py-5 text-xl font-bold text-brand-600">My Postiz</div>
        <nav class="flex-1 px-3 space-y-1">
          <NuxtLink v-for="item in nav" :key="item.to" :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100"
            active-class="!bg-brand-50 !text-brand-700 font-semibold" :exact="item.to === '/'">
            <span>{{ item.icon }}</span><span>{{ ui.t(item.key) }}</span>
          </NuxtLink>
        </nav>
        <div class="p-4 border-t border-slate-200 space-y-2 text-sm">
          <div class="text-slate-500 truncate">{{ user?.email }}</div>
          <div class="flex gap-2">
            <button class="flex-1 rounded-lg border px-2 py-1 hover:bg-slate-50" @click="ui.toggleLocale()">{{ ui.locale === 'ar' ? 'English' : 'عربي' }}</button>
            <button class="flex-1 rounded-lg border px-2 py-1 hover:bg-slate-50" @click="logout">{{ ui.t('logout') }}</button>
          </div>
        </div>
      </aside>
      <main class="flex-1 p-8">
        <div v-if="needsReconnect.length" class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-wrap items-center gap-3 text-red-800">
          <span>⚠️ {{ ui.l('حسابات محتاجة إعادة ربط:', 'Accounts need reconnect:') }} <b>{{ needsReconnect.map(a => a.name).join('، ') }}</b></span>
          <NuxtLink to="/accounts" class="ms-auto rounded-xl bg-red-600 text-white px-3 py-1.5 text-sm">{{ ui.l('إعادة الربط', 'Reconnect') }}</NuxtLink>
        </div>
        <slot />
      </main>
    </div>
  </div>
</template>
<script setup>
const route = useRoute()
const ui = useUiStore()
const { user, clear } = useUserSession()
const { data: accData, refresh: refreshAccounts } = useFetch('/api/accounts', { key: 'layout-accounts', default: () => ({ accounts: [] }), immediate: route.path !== '/login' })
const needsReconnect = computed(() => (accData.value?.accounts || []).filter(a => a.refreshNeeded))
watch(() => route.path, p => { if (p !== '/login') refreshAccounts() })
const nav = [
  { to: '/', key: 'dashboard', icon: '🏠' },
  { to: '/compose', key: 'compose', icon: '✍️' },
  { to: '/calendar', key: 'calendar', icon: '📅' },
  { to: '/accounts', key: 'accounts', icon: '🔗' },
  { to: '/video', key: 'video', icon: '🎬' },
  { to: '/poster', key: 'poster', icon: '🖼️' },
  { to: '/media', key: 'media', icon: '🖼️' },
  { to: '/settings', key: 'settings', icon: '⚙️' }
]
async function logout () {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>
