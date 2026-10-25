// Original per-category background beds, synthesized in pure JS (no samples, no licences).
// Each bed is a seamless loop (all note tails wrap around the loop end), soft and low-passed.
// Add a category by adding an entry to BEDS. Files are cached in assets/music/<category>.wav.
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'

export const MUSIC_DIR = () => resolve(process.cwd(), 'assets/music')
const SR = 32000
const TARGET_RMS = 0.099 // tuned so beds land ≈ -18.5 LUFS like sport
const midi = m => 440 * 2 ** ((m - 69) / 12)

/** Bed definitions. chords = MIDI notes per bar; bars of 4 beats. */
export const BEDS = {
  // sport: light upbeat pulse — Am F C G, 108 BPM, 8th-note plucked arpeggio, soft bass pulse on beats.
  sport: {
    bpm: 108, bars: 16, cutoff: 2600, gain: 1,
    chords: [[57, 60, 64], [53, 57, 60], [48, 55, 60, 64], [55, 59, 62]],
    bass: [45, 41, 48, 43],
    pad: 0.16, pluck: 0.2, pulse: 0.3, arp: [0, 1, 2, 1, 2, 0, 1, 2], shaker: 0.02
  },
  // economy: steady, minimal, clean — Cmaj7 Am7 Fmaj7 G6, quarter-note plucks, pulse on 1 & 3.
  economy: {
    bpm: 96, bars: 16, cutoff: 2300, rms: true,
    chords: [[48, 52, 55, 59], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 52, 59]],
    bass: [36, 33, 29, 31],
    pad: 0.12, pluck: 0.17, pluckDecay: 4.5, arp: [3, 1, 2, 1], arpRate: 4, pulse: 0.22, pulses: 2
  },
  // politics: authoritative news underscore — Dm Bb F C, 104 BPM, steady muted 8th tick, string-like pads,
  // low bass on downbeats, soft timpani hit every 2 bars, gentle riser into each 4-bar phrase.
  politics: {
    bpm: 104, bars: 16, cutoff: 2200, rms: true,
    chords: [[50, 53, 57], [46, 50, 53], [41, 45, 48, 53], [48, 52, 55]],
    bass: [38, 34, 41, 36],
    pad: 0.2, padAttack: 0.5, padHarm: 0.35, pluck: 0, pulse: 0.3, pulses: 2, pulseDecay: 3.2,
    trim: 0.5, tick: 0.16, tickRate: 8, tickNotes: [0, 0, 2, 0, 0, 0, 2, 1], tickOct: 12, timp: 0.4, timpEvery: 2, riser: 0.05
  },
  // trend: light & playful — C G Am F, 116 BPM, bouncy 8ths with a skip, soft shaker.
  trend: {
    bpm: 116, bars: 16, cutoff: 3000, rms: true,
    chords: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]],
    bass: [48, 43, 45, 41],
    pad: 0.1, pluck: 0.2, pluckDecay: 8, arp: [0, 2, 1, 2, 0, 2, 1, -1], pulse: 0.22, shaker: 0.02, octave: 12
  },
  // health: soft & warm — Fmaj7 Cmaj7 Dm7 Bbmaj7, 80 BPM, gentle quarter plucks, no pulse.
  health: {
    bpm: 80, bars: 12, cutoff: 1800, rms: true,
    chords: [[53, 57, 60, 64], [48, 52, 55, 59], [50, 53, 57, 60], [46, 50, 53, 57]],
    bass: [41, 36, 38, 34],
    pad: 0.2, padAttack: 0.9, pluck: 0.12, pluckDecay: 3.5, arp: [2, 3, 1, 3], arpRate: 4, pulse: 0
  },
  // breaking: urgent news alert underscore — Am F Dm E, 124 BPM, driving 16th muted pulse, low impacts on
  // each phrase, rising tension; a short 3-note alert sting is played once at the start (see STINGS).
  breaking: {
    bpm: 124, bars: 16, cutoff: 2000, rms: true,
    chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
    bass: [33, 29, 26, 28],
    pad: 0.16, padAttack: 0.3, padHarm: 0.4, pluck: 0, pulse: 0.28, pulses: 4, pulseDecay: 5,
    trim: 1.4, tick: 0.15, tickRate: 16, tickNotes: [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2, 1, 0], tickOct: 12, timp: 0.5, timpEvery: 4, riser: 0.07
  }
}
/** One-shot alert stings (played once at the reel start, not looped). notes: [midi, start s]. */
export const STINGS = {
  breaking: { notes: [[62, 0], [69, 0.16], [74, 0.32]], hit: 0.6 }
}
export const hasBed = c => !!BEDS[c]

function wav (L, R, g) {
  const len = L.length
  const buf = Buffer.alloc(44 + len * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(len * 4, 40)
  for (let i = 0; i < len; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4) }
  return buf
}

/** One-shot sting: soft bell-ish notes + low impact, low-passed. */
function synthSting (st) {
  const len = Math.round(2.6 * SR); const L = new Float32Array(len); const R = new Float32Array(len)
  for (const [m, at] of st.notes) {
    const f = midi(m); const s0 = Math.round(at * SR)
    for (let i = 0; s0 + i < len; i++) { const t = i / SR; const v = 0.3 * Math.min(1, t / 0.006) * Math.exp(-t * 3.2) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 6) + 0.5 * Math.sin(Math.PI * f * t)); L[s0 + i] += v; R[s0 + i] += v }
  }
  const s0 = Math.round(st.notes.at(-1)[1] * SR)
  for (let i = 0; s0 + i < len; i++) { const t = i / SR; const v = st.hit * Math.min(1, t / 0.004) * Math.exp(-t * 3) * Math.sin(2 * Math.PI * 55 * (1 + 0.6 * Math.exp(-t * 20)) * t); L[s0 + i] += v; R[s0 + i] += v }
  const a = 1 - Math.exp(-2 * Math.PI * 2600 / SR)
  for (const ch of [L, R]) { let y = 0; for (let i = 0; i < len; i++) { y += a * (ch[i] - y); ch[i] = y } }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]))
  return wav(L, R, 0.7 / (peak || 1))
}

/** Path to the category's one-shot sting (generated on first use), or null. */
export async function ensureSting (category, { force = false } = {}) {
  const st = STINGS[category]; if (!st) return null
  const dir = MUSIC_DIR(); await mkdir(dir, { recursive: true })
  const f = join(dir, `${category}-sting.wav`)
  if (force || !existsSync(f)) await writeFile(f, synthSting(st))
  return f
}

function synth (b) {
  const beat = 60 / b.bpm; const len = Math.round(b.bars * 4 * beat * SR)
  const L = new Float32Array(len); const R = new Float32Array(len)
  const add = (start, dur, fn, pan = 0) => { // wraps around → seamless loop
    const s0 = Math.round(start * SR); const n = Math.round(dur * SR)
    const gl = Math.cos((pan + 1) * Math.PI / 4); const gr = Math.sin((pan + 1) * Math.PI / 4)
    for (let i = 0; i < n; i++) { const v = fn(i / SR); const j = (s0 + i) % len; L[j] += v * gl; R[j] += v * gr }
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let bar = 0; bar < b.bars; bar++) {
    const ch = b.chords[bar % b.chords.length]; const t0 = bar * 4 * beat; const barDur = 4 * beat
    // pad: detuned sines + soft 2nd harmonic, slow attack/release
    ch.forEach((m, k) => {
      const f = midi(m)
      add(t0, barDur + 1.2, t => { const env = Math.min(1, t / (b.padAttack || 0.6)) * (t > barDur ? Math.max(0, 1 - (t - barDur) / 1.2) : 1)
        return b.pad / ch.length * env * (Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.003 * t) + 0.15 * Math.sin(4 * Math.PI * f * t) + (b.padHarm || 0) * (Math.sin(6 * Math.PI * f * t) / 3 + Math.sin(8 * Math.PI * f * 1.002 * t) / 4)) }, (k - 1) * 0.4)
    })
    // pluck arpeggio (8ths, one octave up)
    const ar = b.arpRate || 8
    for (let e = 0; e < ar && b.pluck; e++) {
      const step = b.arp[e % b.arp.length]; if (step < 0) continue
      const f = midi(ch[step % ch.length] + (b.octave ?? 12)); const acc = e % 2 ? 0.7 : 1; const pd = b.pluckDecay || 6
      add(t0 + e * 4 * beat / ar, b.pluckDecay ? Math.min(2.5, 6 / pd) : 0.9, t => b.pluck * acc * Math.exp(-t * pd) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 12)), e % 2 ? 0.35 : -0.35)
    }
    // bass pulse on every beat (soft, no click)
    const np = b.pulses ?? 4
    for (let q = 0; q < np && b.pulse; q++) {
      const f = midi(b.bass[bar % b.bass.length]); const pdur = 4 * beat / np
      add(t0 + q * pdur, pdur * 0.95, t => b.pulse * (np > 4 && q % 2 ? 0.6 : 1) * Math.min(1, t / 0.012) * Math.exp(-t * (b.pulseDecay || 4.5)) * Math.sin(2 * Math.PI * f * t))
    }
    // muted synth tick (news "clock"): short, filtered, alternating chord tones
    if (b.tick) {
      const tr = b.tickRate || 8
      for (let e = 0; e < tr; e++) {
        const f = midi(ch[b.tickNotes[e % b.tickNotes.length] % ch.length] + (b.tickOct ?? 12)); const acc = e % (tr / 4) === 0 ? 1 : 0.62
        add(t0 + e * 4 * beat / tr, 0.12, t => b.tick * acc * Math.min(1, t / 0.002) * Math.exp(-t * 38) * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.5), e % 2 ? 0.25 : -0.25)
      }
    }
    // soft timpani-like hit (pitch drop onto the bass root)
    if (b.timp && bar % (b.timpEvery || 2) === 0) {
      const f = midi(b.bass[bar % b.bass.length])
      add(t0, 1.6, t => b.timp * Math.min(1, t / 0.004) * Math.exp(-t * 2.6) * Math.sin(2 * Math.PI * (f * (1 + 0.5 * Math.exp(-t * 22))) * t))
    }
    // rising tension into each 4-bar phrase: swelling filtered tone on the next root, cut at the downbeat
    if (b.riser && bar % 4 === 3) {
      const f = midi(b.bass[(bar + 1) % b.bass.length] + 24); const d = 4 * beat
      add(t0, d, t => { const p = t / d; return b.riser * p * p * Math.min(1, (d - t) / 0.03) * (Math.sin(2 * Math.PI * f * (1 + 0.03 * p) * t) + 0.5 * Math.sin(3 * Math.PI * f * (1 + 0.03 * p) * t)) })
    }
    // very soft shaker on off-beats (band-limited noise; lowpass below tames it)
    if (b.shaker) for (let e = 1; e < 8; e += 2) add(t0 + e * beat / 2, 0.08, t => b.shaker * rnd() * Math.exp(-t * 60))
  }
  // gentle one-pole low-pass (2 passes), run twice around the loop so the state is continuous
  const a = 1 - Math.exp(-2 * Math.PI * b.cutoff / SR)
  for (const ch of [L, R]) for (let pass = 0; pass < 2; pass++) { let y = 0; for (let r = 0; r < 2; r++) for (let i = 0; i < len; i++) { y += a * (ch[i] - y); if (r) ch[i] = y } }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  // sport: -6 dBFS peak (≈ -18.5 LUFS). Others: matched by RMS to the same loudness, capped at -1 dBFS peak.
  let g = 0.5 / (peak || 1) * (b.gain ?? 1)
  if (b.rms) { let e = 0; for (let i = 0; i < len; i++) e += L[i] * L[i] + R[i] * R[i]; const rms = Math.sqrt(e / (2 * len)); g = Math.min(TARGET_RMS / (rms || 1) * 10 ** ((b.trim || 0) / 20), 0.89 / (peak || 1)) }
  return { buf: wav(L, R, g), seconds: len / SR }
}

/** Path to the category bed (generated on first use), or null if the category has no bed yet. */
export async function ensureBed (category, { force = false } = {}) {
  const b = BEDS[category]; if (!b) return null
  const dir = MUSIC_DIR(); await mkdir(dir, { recursive: true })
  const f = join(dir, `${category}.wav`)
  if (force || !existsSync(f)) await writeFile(f, synth(b).buf)
  return f
}
