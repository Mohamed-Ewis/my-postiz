// Posting time slots ("HH:MM" wall-clock in the user's timezone) and next free slot search.
import { prisma } from '../utils/db.js'
import { getSetting } from './settings.js'

/** Offset (ms) of tz at a given UTC instant. */
function tzOffset (date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).map(x => [x.type, x.value]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}
/** Wall-clock (y,m,d,hh,mm) in tz -> UTC Date. */
export function zonedToUtc (y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - tzOffset(new Date(guess), tz)
  t = guess - tzOffset(new Date(t), tz) // second pass handles DST edges
  return new Date(t)
}
export function zonedParts (date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day }
}

export const validSlots = arr => [...new Set((arr || []).filter(s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)))].sort()

/** First slot after now (+1 min) where none of the accounts already has a queued post within ±1 min. */
export async function nextFreeSlot (accountIds, { after = new Date(), days = 30 } = {}) {
  const tz = await getSetting('timezone')
  const accounts = await prisma.socialAccount.findMany({ where: { id: { in: accountIds } } })
  let slots = validSlots(accounts.flatMap(a => { try { return JSON.parse(a.postingTimes) } catch { return [] } }))
  if (!slots.length) slots = validSlots(await getSetting('defaultSlots'))
  const busy = await prisma.post.findMany({
    where: { state: { in: ['QUEUE', 'PUBLISHED'] }, publishAt: { gte: after }, targets: { some: { accountId: { in: accountIds } } } },
    select: { publishAt: true }
  })
  const busyMin = new Set(busy.map(b => Math.round(b.publishAt.getTime() / 60000)))
  const start = new Date(after.getTime() + 60000)
  for (let i = 0; i <= days; i++) {
    const { y, m, d } = zonedParts(new Date(start.getTime() + i * 864e5), tz)
    for (const s of slots) {
      const [hh, mm] = s.split(':').map(Number)
      const at = zonedToUtc(y, m, d, hh, mm, tz)
      const k = Math.round(at.getTime() / 60000)
      if (at > start && !busyMin.has(k) && !busyMin.has(k - 1) && !busyMin.has(k + 1)) return at
    }
  }
  return null
}
