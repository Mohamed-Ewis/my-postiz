<template>
  <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 to-white">
    <form class="card w-full max-w-sm space-y-4" @submit.prevent="submit">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-brand-600">My Postiz</h1>
        <button type="button" class="text-sm text-slate-500" @click="ui.toggleLocale()">{{ ui.locale === 'ar' ? 'EN' : 'ع' }}</button>
      </div>
      <p class="text-slate-500">{{ status?.needsSetup ? ui.t('setupHint') : ui.t('login') }}</p>
      <input v-if="status?.needsSetup" v-model="form.name" class="input" :placeholder="ui.t('name')">
      <input v-model="form.email" type="email" required class="input" :placeholder="ui.t('email')">
      <input v-model="form.password" type="password" required minlength="8" class="input" :placeholder="ui.t('password')">
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button class="btn w-full" :disabled="loading">{{ status?.needsSetup ? ui.t('createBtn') : ui.t('loginBtn') }}</button>
    </form>
  </div>
</template>
<script setup>
const ui = useUiStore()
const { fetch: refreshSession } = useUserSession()
const { data: status } = await useFetch('/api/auth/status')
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const loading = ref(false)
async function submit () {
  error.value = ''; loading.value = true
  try {
    await $fetch(status.value?.needsSetup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: form })
    await refreshSession()
    await navigateTo('/')
  } catch (e) {
    error.value = e.data?.statusMessage || e.message
  } finally { loading.value = false }
}
</script>
