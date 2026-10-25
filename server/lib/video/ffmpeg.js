// Locate FFmpeg/FFprobe (bundled via npm, overridable by env) and run them with progress.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
function tryRequire (name, pick) { try { return pick(require(name)) } catch { return null } }

export function ffmpegPath () {
  return process.env.FFMPEG_PATH || tryRequire('ffmpeg-static', m => m) || 'ffmpeg'
}
export function ffprobePath () {
  return process.env.FFPROBE_PATH || tryRequire('ffprobe-static', m => m.path) || 'ffprobe'
}
export function ffmpegAvailable () {
  const p = ffmpegPath()
  return p === 'ffmpeg' ? true : existsSync(p)
}

/** Run ffmpeg. onProgress(seconds) is called from -progress output. */
export function runFfmpeg (args, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-y', '-nostdin', '-progress', 'pipe:1', '-loglevel', 'error', ...args], { windowsHide: true })
    let err = ''
    proc.stdout.on('data', d => {
      const m = /out_time_(?:us|ms)=(\d+)/.exec(String(d))
      if (m && onProgress) onProgress(Number(m[1]) / 1e6)
    })
    proc.stderr.on('data', d => { err = (err + d).slice(-4000) })
    proc.on('error', e => reject(new Error(`FFmpeg not found or failed to start (${ffmpegPath()}): ${e.message}`)))
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))))
    signal?.addEventListener('abort', () => proc.kill('SIGKILL'))
  })
}

export function probe (file) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { windowsHide: true })
    let out = ''; let err = ''
    proc.stdout.on('data', d => { out += d })
    proc.stderr.on('data', d => { err += d })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err}`))
      const j = JSON.parse(out)
      const v = j.streams.find(s => s.codec_type === 'video')
      const a = j.streams.find(s => s.codec_type === 'audio')
      resolve({ duration: Number(j.format.duration) || 0, width: v?.width, height: v?.height, vcodec: v?.codec_name, acodec: a?.codec_name, hasAudio: !!a, hasVideo: !!v })
    })
  })
}
