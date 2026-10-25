<template>
  <NuxtLayout><NuxtPage /></NuxtLayout>
</template>
<script setup>
const ui = useUiStore()
useHead(() => ({
  htmlAttrs: { lang: ui.locale, dir: ui.locale === 'ar' ? 'rtl' : 'ltr' },
  title: 'My Postiz',
  link: [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&display=swap' }]
}))
</script>
