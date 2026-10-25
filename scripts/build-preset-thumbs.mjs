// Regenerates public/presets/*.jpg from server/templates/presets.js (run: node scripts/build-preset-thumbs.mjs)
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { renderDesign, overlayPng, loadImage } from '../server/templates/index.js'
import { BUILTIN_PRESETS, STARTER_PHOTOS } from '../server/templates/presets.js'

const tmp = mkdtempSync(join(tmpdir(), 'thumbs-'))
const photo = k => resolve('assets/presets/photos', STARTER_PHOTOS[k].file)
const date = lang => lang === 'en' ? 'Oct 19, 2026' : '19 أكتوبر 2026'
for (const p of BUILTIN_PRESETS) {
  const d = p.data; const name = p.id.replace('builtin:', '')
  const png = join(tmp, name + '.png')
  if (p.kind === 'poster') {
    const image = d.starterPhoto ? await loadImage(photo(d.starterPhoto), 'image/jpeg') : null
    writeFileSync(png, renderDesign({ ...d, image, date: date(d.lang), brand: {} }, 540))
  } else {
    writeFileSync(join(tmp, 'ov.png'), overlayPng({ width: 1080, height: 1920, text: d.headline, category: d.category, lang: d.lang, brand: {} }))
    execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-i', photo(d.starterPhoto), '-i', join(tmp, 'ov.png'), '-filter_complex', '[0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[b];[b][1]overlay', '-frames:v', '1', png])
  }
  execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-i', png, '-vf', 'scale=270:-2', '-q:v', '4', resolve('public/presets', name + '.jpg')])
  console.log('thumb', name)
}
rmSync(tmp, { recursive: true, force: true })
