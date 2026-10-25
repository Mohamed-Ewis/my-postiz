export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    adminEmail: '',
    adminPassword: '',
    tokenEncryptionKey: '',
    mediaDir: process.env.MEDIA_DIR || './storage/media',
    mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL || '',
    public: { appUrl: 'http://localhost:3000' }
  },
  ignore: ['storage/**'],
  vite: { server: { watch: { ignored: ['**/storage/**', '**/prisma/*.db*'] } } },
  nitro: { externals: { external: ['@prisma/client', '.prisma', '@resvg/resvg-js', 'ffmpeg-static', 'ffprobe-static', 'opentype.js', 'image-size'] } }
})
