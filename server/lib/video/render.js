// Local video renderer: scenes (images/videos) + Ken Burns + captions + xfade + music/narration + logo -> MP4 (H.264/AAC).
import { mkdir, writeFile, rm, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '../../utils/db.js'
import { mediaRoot, safeMediaPath, createMediaFromBuffer, createMediaFromFile, newMediaPath } from '../media.js'
import { generateImage } from '../ai.js'
import { runFfmpeg, probe } from './ffmpeg.js'
import { captionPng, titleCardPng } from './text.js'
import { synthesize, ttsProvider } from './tts.js'
import { renderDesign, overlayPng, loadImage, TEMPLATES, CATEGORIES } from '../../templates/index.js'
import { brandForRender } from '../brand.js'
import { REEL_ID, normalizeReelSpec, renderReel } from './reel.js'

export const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] }
export const TRANSITIONS = ['fade', 'dissolve', 'slideleft', 'slideright', 'smoothleft', 'circleopen', 'wipeleft', 'fadeblack']
const FPS = 30
const KB_MOVES = ['in', 'out', 'left', 'right']

const parse = (v, d) => { try { return v ? JSON.parse(v) : d } catch { return d } }
const num = (v, d, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) && v !== '' && v !== null ? +v : d))

/** Normalize/validate a user spec. */
export function normalizeSpec (s = {}) {
  const aspect = ASPECTS[s.aspect] ? s.aspect : '9:16'
  const T = num(s.transition?.duration, 0.6, 0, 2)
  const scenes = (Array.isArray(s.scenes) ? s.scenes : []).slice(0, 30).map(sc => ({
    mediaId: sc.mediaId || null,
    imagePrompt: sc.imagePrompt ? String(sc.imagePrompt).slice(0, 1000) : '',
    text: String(sc.text || '').slice(0, 400),
    narration: sc.narration != null ? String(sc.narration).slice(0, 1200) : null,
    duration: num(sc.duration, 4, T + 0.6, 60)
  })).filter(sc => sc.mediaId || sc.imagePrompt || sc.text)
  if (!scenes.length) throw Object.assign(new Error('ضيف مشهد واحد على الأقل'), { statusCode: 400 })
  const card = c => (c?.title ? { title: String(c.title).slice(0, 120), subtitle: String(c.subtitle || '').slice(0, 160), duration: num(c.duration, 2.5, T + 0.6, 10) } : null)
  return {
    aspect,
    transition: { type: TRANSITIONS.includes(s.transition?.type) ? s.transition.type : 'fade', duration: T },
    kenBurns: s.kenBurns !== false,
    captionPosition: ['top', 'center', 'bottom'].includes(s.captionPosition) ? s.captionPosition : 'bottom',
    scenes,
    intro: card(s.intro),
    outro: card(s.outro),
    music: s.music?.mediaId ? { mediaId: s.music.mediaId, volume: num(s.music.volume, 0.25, 0, 1) } : null,
    logoMediaId: s.logoMediaId || null,
    narration: !!s.narration,
    lang: s.lang === 'en' ? 'en' : 'ar',
    quality: s.quality === 'draft' ? 'draft' : 'hd',
    afterRender: s.afterRender === 'queue' ? 'queue' : 'draft',
    design: s.design?.category && CATEGORIES[s.design.category] ? { category: s.design.category, templateId: TEMPLATES.some(t => t.id === s.design.templateId) ? s.design.templateId : null, source: String(s.design.source || '').slice(0, 80) } : null
  }
}

function kenBurnsFilter (move, W, H, frames) {
  const z = move === 'out' ? `1.18-0.18*on/${frames}` : move === 'in' ? `1+0.18*on/${frames}` : '1.15'
  const x = move === 'left' ? `(iw-iw/zoom)*(1-on/${frames})` : move === 'right' ? `(iw-iw/zoom)*on/${frames}` : 'iw/2-(iw/zoom/2)'
  return `zoompan=z='${z}':x='${x}':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`
}
const cover = (W, H) => `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`

/**
 * Render a job. update({progress, stage}) reports progress (0-100).
 * Returns the created Media row.
 */
export async function renderVideo (job, update = async () => {}) {
  if (parse(job.spec, {}).template === REEL_ID) return renderReelJob(job, update)
  const spec = normalizeSpec(parse(job.spec, {}))
  const [W, H] = spec.quality === 'draft' ? ASPECTS[spec.aspect].map(v => Math.round(v * 2 / 3 / 2) * 2) : ASPECTS[spec.aspect]
  const T = spec.transition.duration
  const tmp = join(mediaRoot(), '.tmp', `job-${job.id}`)
  await mkdir(tmp, { recursive: true })
  const mediaById = async id => {
    const m = id && await prisma.media.findFirst({ where: { id, userId: job.userId } })
    if (!m) throw new Error(`Media not found: ${id}`)
    return { ...m, full: safeMediaPath(m.path) }
  }

  const design = spec.design
  const brand = design ? await brandForRender() : null
  // Title cards: the category template (photo templates fall back to type-only when there is no photo).
  const cardPng = async (title, subtitle, imgPath, mime) => {
    let templateId = design.templateId || 'type-only'
    if (['big-stat'].includes(templateId)) templateId = 'type-only'
    const image = imgPath ? await loadImage(imgPath, mime).catch(() => null) : null
    return renderDesign({ templateId, category: design.category, width: W, height: H, headline: title, subtitle, image, brand, lang: spec.lang, source: design.source })
  }
  try {
    // 1) Resolve scene media (generate AI images where requested)
    const scenes = []
    for (const [i, sc] of spec.scenes.entries()) {
      let src = null
      if (sc.mediaId) src = await mediaById(sc.mediaId)
      else if (sc.imagePrompt) {
        await update({ stage: `AI image ${i + 1}/${spec.scenes.length}`, progress: Math.round(2 + 10 * i / spec.scenes.length) })
        const { buffer, mime } = await generateImage(sc.imagePrompt, { aspect: spec.aspect })
        const m = await createMediaFromBuffer(job.userId, buffer, `ai-scene-${Date.now()}.png`, mime)
        src = { ...m, full: safeMediaPath(m.path) }
      }
      scenes.push({ ...sc, src })
    }

    // 2) Narration (optional)
    if (spec.narration && ttsProvider()) {
      for (const [i, sc] of scenes.entries()) {
        const say = (sc.narration ?? sc.text).trim()
        if (!say) continue
        await update({ stage: `Narration ${i + 1}/${scenes.length}`, progress: 12 + Math.round(6 * i / scenes.length) })
        sc.voice = await synthesize(say, join(tmp, `voice_${i}`), { lang: spec.lang })
        const d = (await probe(sc.voice)).duration
        sc.duration = Math.max(sc.duration, d + 0.7)
      }
    }

    // 3) Build segment list
    const segs = []
    if (spec.intro) segs.push({ kind: 'card', ...spec.intro })
    for (const sc of scenes) segs.push({ kind: 'scene', ...sc })
    if (spec.outro) segs.push({ kind: 'card', ...spec.outro })

    // 4) Render each segment to a silent clip
    const total = segs.reduce((a, s) => a + s.duration, 0) - T * (segs.length - 1)
    for (const [i, s] of segs.entries()) {
      await update({ stage: `Scene ${i + 1}/${segs.length}`, progress: 18 + Math.round(52 * i / segs.length) })
      const out = join(tmp, `seg_${i}.mp4`)
      const frames = Math.round(s.duration * FPS)
      const args = []
      let chain
      if (s.kind === 'card' || !s.src) {
        const png = join(tmp, `card_${i}.png`)
        const firstImg = scenes.find(x => x.src?.type === 'image')?.src
        await writeFile(png, design
          ? await cardPng(s.title || s.text || ' ', s.kind === 'card' ? s.subtitle : '', i === 0 && firstImg ? firstImg.full : null, firstImg?.mimeType)
          : titleCardPng({ title: s.title || s.text || ' ', subtitle: s.kind === 'card' ? s.subtitle : '', width: W, height: H }))
        args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.duration), '-i', png)
        chain = `[0:v]${cover(W, H)},fps=${FPS}`
        if (spec.kenBurns) chain = `[0:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},${kenBurnsFilter('in', W, H, frames)}`
      } else if (s.src.type === 'video') {
        args.push('-stream_loop', '-1', '-t', String(s.duration), '-i', s.src.full)
        chain = `[0:v]${cover(W, H)},fps=${FPS}`
      } else {
        // Pre-scale the still once (bigger than frame so Ken Burns has room), then loop it.
        const still = join(tmp, `still_${i}.png`)
        const k = spec.kenBurns ? 1.3 : 1
        await runFfmpeg(['-i', s.src.full, '-frames:v', '1', '-vf', cover(Math.round(W * k / 2) * 2, Math.round(H * k / 2) * 2), still])
        args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.duration), '-i', still)
        chain = spec.kenBurns ? `[0:v]${kenBurnsFilter(KB_MOVES[i % KB_MOVES.length], W, H, frames)}` : `[0:v]fps=${FPS}`
      }
      let filter = `${chain},format=yuv420p[base]`
      if (s.kind === 'scene' && s.text && s.src) {
        const cap = join(tmp, `cap_${i}.png`)
        await writeFile(cap, design
          ? overlayPng({ width: W, height: H, text: s.text, category: design.category, lang: spec.lang, brand: spec.logoMediaId ? { ...brand, logo: null } : brand, position: spec.captionPosition })
          : captionPng({ text: s.text, width: W, height: H, position: spec.captionPosition }))
        args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.duration), '-i', cap)
        // Text reveal: fade in + slide up over 0.5s (template captions), simple fade otherwise.
        const slide = design ? `'max(0,${Math.round(H * 0.035)}*(1-(t-0.15)/0.5))'` : '0'
        filter = `${chain},format=yuv420p[bg];[1:v]format=rgba,fade=t=in:st=0.15:d=0.5:alpha=1[cap];[bg][cap]overlay=x=0:y=${slide}:shortest=1,format=yuv420p[base]`
      }
      await runFfmpeg([...args, '-filter_complex', filter, '-map', '[base]', '-t', String(s.duration), '-r', String(FPS),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', out])
      s.file = out
    }

    // 5) Final assembly: xfade chain + audio + logo
    await update({ stage: 'Final mix', progress: 72 })
    const args = []
    segs.forEach(s => args.push('-i', s.file))
    const filters = []
    let last = '[0:v]'
    let offset = 0
    const starts = [0]
    for (let i = 1; i < segs.length; i++) {
      offset += segs[i - 1].duration - T
      starts.push(offset)
      const label = `[x${i}]`
      filters.push(T > 0
        ? `${last}[${i}:v]xfade=transition=${spec.transition.type}:duration=${T}:offset=${offset.toFixed(3)}${label}`
        : `${last}[${i}:v]concat=n=2:v=1:a=0${label}`)
      last = label
    }
    let idx = segs.length
    if (spec.logoMediaId) {
      const logo = await mediaById(spec.logoMediaId)
      args.push('-i', logo.full)
      const lw = Math.round(Math.min(W, H) * 0.16)
      filters.push(`[${idx}:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=0.85[logo]`, `${last}[logo]overlay=W-w-${Math.round(W * 0.04)}:${Math.round(W * 0.04)}[vl]`)
      last = '[vl]'
      idx++
    }
    filters.push(`${last}format=yuv420p[vout]`)

    const audioLabels = []
    const segIndexOffset = spec.intro ? 1 : 0
    scenes.forEach((sc, i) => {
      if (!sc.voice) return
      args.push('-i', sc.voice)
      const ms = Math.round((starts[i + segIndexOffset] + 0.3) * 1000)
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${idx}]`)
      audioLabels.push(`[v${idx}]`)
      idx++
    })
    if (spec.music) {
      const music = await mediaById(spec.music.mediaId)
      args.push('-stream_loop', '-1', '-i', music.full)
      const vol = audioLabels.length ? spec.music.volume * 0.6 : spec.music.volume
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${vol.toFixed(3)},atrim=0:${total.toFixed(3)},afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 2).toFixed(3)}:d=2[m]`)
      audioLabels.push('[m]')
      idx++
    }
    if (!audioLabels.length) {
      args.push('-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')
      audioLabels.push(`[${idx}:a]`)
      idx++
    }
    filters.push(audioLabels.length > 1
      ? `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,atrim=0:${total.toFixed(3)}[aout]`
      : `${audioLabels[0]}atrim=0:${total.toFixed(3)}[aout]`)

    const outFile = join(tmp, 'final.mp4')
    await runFfmpeg([...args, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(3),
      '-c:v', 'libx264', '-preset', spec.quality === 'draft' ? 'veryfast' : 'medium', '-crf', '20', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', outFile],
    { onProgress: t => update({ progress: Math.min(97, 72 + Math.round(25 * t / total)) }) })

    // 6) Thumbnail + save to library
    await update({ stage: 'Saving', progress: 98 })
    const thumb = await newMediaPath('thumb.jpg', 'image/jpeg')
    await runFfmpeg(['-ss', String(Math.min(total / 2, spec.intro ? spec.intro.duration + 1 : 1.5)), '-i', outFile, '-frames:v', '1', '-q:v', '3', thumb.full])
    const info = await probe(outFile)
    const media = await createMediaFromFile(job.userId, outFile, `${(job.title || 'video').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'video'}.mp4`, 'video/mp4', {
      width: info.width, height: info.height, duration: info.duration, thumbnail: thumb.rel
    })
    return media
  } finally {
    if (process.env.VIDEO_KEEP_TMP !== 'true') await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

/** "الكل" news reel template job (items of image + title + body). */
async function renderReelJob (job, update) {
  const spec = normalizeReelSpec(parse(job.spec, {}))
  const tmp = join(mediaRoot(), '.tmp', `job-${job.id}`)
  const resolveFile = async x => {
    const m = x.mediaId && await prisma.media.findFirst({ where: { id: x.mediaId, userId: job.userId } })
    if (!m) throw new Error(`Media not found: ${x.mediaId}`)
    return safeMediaPath(m.path)
  }
  try {
    const outFile = join(tmp, 'final.mp4')
    const r = await renderReel(spec, { tmp, outFile, resolveFile, update })
    await update({ stage: 'Saving', progress: 98 })
    const thumb = await newMediaPath('thumb.jpg', 'image/jpeg')
    await runFfmpeg(['-ss', String(r.timeline.segments[1].start + 2.5), '-i', outFile, '-frames:v', '1', '-q:v', '3', thumb.full])
    return createMediaFromFile(job.userId, outFile, `${(job.title || 'reel').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'reel'}.mp4`, 'video/mp4', {
      width: r.info.width, height: r.info.height, duration: r.info.duration, thumbnail: thumb.rel
    })
  } finally {
    if (process.env.VIDEO_KEEP_TMP !== 'true') await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}
