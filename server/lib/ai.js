// Framework-free AI helpers (text + image). Errors carry statusCode + Arabic message.
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode, statusMessage: message })

function mapStatus (status, msg = '') {
  if (status === 429) return fail(429, 'خلصت الحصة (Quota) أو الطلبات كتير (429). استنى شوية أو فعّل الـ Billing في حساب الـ AI.')
  if (status === 401 || status === 403) return fail(401, 'مفتاح الـ AI غلط أو مالوش صلاحية.')
  return fail(502, `خطأ من مزود الـ AI (${status}): ${msg}`.slice(0, 300))
}
export const aiProvider = () => (process.env.AI_PROVIDER || 'gemini').toLowerCase()
export const aiInfo = () => ({
  provider: aiProvider(),
  textModel: aiProvider() === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : (process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
  imageModel: aiProvider() === 'openai' ? (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1') : (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'),
  hasKey: aiProvider() === 'openai' ? !!process.env.OPENAI_API_KEY : !!process.env.GEMINI_API_KEY
})

function key () {
  const k = aiProvider() === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY
  if (!k) throw fail(400, `مفتاح ${aiProvider() === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} مش موجود في ملف .env`)
  return k
}
async function post (url, headers, body) {
  let res
  try { res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }) } catch (e) {
    throw fail(502, 'مقدرتش أوصل لمزود الـ AI، اتأكد من النت: ' + e.message)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw mapStatus(res.status, data?.error?.message)
  return data
}
const gemini = (model, body) => post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': key() }, body)
const openaiBase = () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

export async function generateText (prompt) {
  const info = aiInfo()
  if (info.provider === 'openai') {
    const d = await post(`${openaiBase()}/chat/completions`, { authorization: `Bearer ${key()}` }, { model: info.textModel, messages: [{ role: 'user', content: prompt }], temperature: 0.8 })
    return (d?.choices?.[0]?.message?.content || '').trim()
  }
  const d = await gemini(info.textModel, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8 } })
  return (d?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim()
}

/** Returns { buffer, mime }. aspect: "1:1" | "4:5" | "16:9" | "9:16" */
export async function generateImage (prompt, { aspect = '1:1' } = {}) {
  const info = aiInfo()
  if (info.provider === 'openai') {
    const size = { '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536', '4:5': '1024x1536' }[aspect] || '1024x1024'
    const d = await post(`${openaiBase()}/images/generations`, { authorization: `Bearer ${key()}` }, { model: info.imageModel, prompt, size, n: 1 })
    const b64 = d?.data?.[0]?.b64_json
    if (!b64) throw fail(502, 'مزود الـ AI مرجعش صورة')
    return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png' }
  }
  const d = await gemini(info.imageModel, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } }
  })
  const part = (d?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data)
  if (!part) throw fail(502, 'Gemini مرجعش صورة، جرّب وصف تاني')
  return { buffer: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType || 'image/png' }
}
