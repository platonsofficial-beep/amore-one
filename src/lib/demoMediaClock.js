/**
 * Evening clock for auth-disabled demo sessions.
 * Marketing captures happen at any hour. Outside the dinner window the demo
 * pretends it is 20:30 venue time, so lateness and seated durations stay small.
 * Callers must skip this unless login is bypassed. Real venues keep the wall clock.
 */

export const DEMO_TIME_ZONE = 'Asia/Nicosia'
const SERVICE_OPEN = 17 * 60
const SERVICE_CLOSE = 22 * 60 + 30
const DEMO_HOUR = 20
const DEMO_MINUTE = 30

function part(parts, type) {
  return parts.find((entry) => entry.type === type)?.value ?? ''
}

export function venueClock(date, timeZone = DEMO_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const hour = Number(part(parts, 'hour'))
  const minute = Number(part(parts, 'minute'))
  return {
    dateKey: `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`,
    minutes: hour * 60 + minute,
  }
}

/** A Date that reads as hour:minute on dateKey in the venue zone. */
export function dateAtVenueTime(dateKey, hour, minute, timeZone = DEMO_TIME_ZONE) {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  const utcGuess = new Date(`${dateKey}T${hh}:${mm}:00Z`)
  const asUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const asZone = new Date(utcGuess.toLocaleString('en-US', { timeZone }))
  return new Date(utcGuess.getTime() - (asZone.getTime() - asUtc.getTime()))
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}

export function venueTimeLabel(date, timeZone = DEMO_TIME_ZONE) {
  const { minutes } = venueClock(date, timeZone)
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Wall clock during dinner service, otherwise 20:30 on the venue's current date.
 */
export function demoServiceInstant(realNow = new Date(), timeZone = DEMO_TIME_ZONE) {
  const clock = venueClock(realNow, timeZone)
  if (clock.minutes >= SERVICE_OPEN && clock.minutes <= SERVICE_CLOSE) return new Date(realNow.getTime())
  return dateAtVenueTime(clock.dateKey, DEMO_HOUR, DEMO_MINUTE, timeZone)
}

let installed = false

/** Make `new Date()` and `Date.now()` return the demo service instant. */
export function installDemoClock(realNow = new Date()) {
  if (installed) return demoServiceInstant(realNow)
  const frozen = demoServiceInstant(realNow).getTime()
  const RealDate = Date
  function DemoDate(...args) {
    if (!new.target) return args.length ? RealDate(...args) : new RealDate(frozen).toString()
    if (args.length === 0) return new RealDate(frozen)
    return new RealDate(...args)
  }
  DemoDate.now = () => frozen
  DemoDate.parse = RealDate.parse
  DemoDate.UTC = RealDate.UTC
  DemoDate.prototype = RealDate.prototype
  Object.setPrototypeOf(DemoDate, RealDate)
  globalThis.Date = DemoDate
  installed = true
  return new RealDate(frozen)
}
