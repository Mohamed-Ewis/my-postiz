// Upload a File to the media library via the streaming /api/media endpoint. Returns the created media item.
export function useMediaUpload () {
  const uploading = ref(false)
  const uploadError = ref('')
  async function imageSize (file) {
    try { const b = await createImageBitmap(file); const r = { width: b.width, height: b.height }; b.close?.(); return r } catch { return {} }
  }
  async function uploadFile (file) {
    uploading.value = true; uploadError.value = ''
    try {
      const fd = new FormData()
      fd.append('file', file, file.name || `pasted-${Date.now()}.png`)
      if (file.type.startsWith('image/')) for (const [k, v] of Object.entries(await imageSize(file))) if (v) fd.append(k, String(v))
      const [m] = await $fetch('/api/media', { method: 'POST', body: fd })
      return m
    } catch (e) { uploadError.value = e.data?.statusMessage || e.message; return null } finally { uploading.value = false }
  }
  return { uploading, uploadError, uploadFile }
}
