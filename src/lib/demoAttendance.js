import { venueLocationIsSet } from './attendance'

/** Demo clock employee. Auth-disabled sessions only. */
export const DEMO_CLOCK_EMPLOYEE_ID = 'dev-elena'

/** Nicosia, so the demo Today card has a real venue pin. */
export const DEMO_VENUE_LAT = 35.1738
export const DEMO_VENUE_LNG = 33.3644

export function demoPersonName(localeId = 'en') {
  return localeId === 'el' ? 'Έλενα' : 'Elena'
}

const STOCK_DEMO_NAMES = new Set([
  'elena',
  'elena christodoulou',
  'έλενα',
  'development user',
  'χρήστης ανάπτυξης',
])

/** Stock demo persona follows the language. A name typed in Settings stays. */
export function resolveDemoDisplayName(displayName, localeId = 'en') {
  const trimmed = `${displayName ?? ''}`.trim()
  if (!trimmed || STOCK_DEMO_NAMES.has(trimmed.toLocaleLowerCase('el'))) {
    return demoPersonName(localeId)
  }
  return trimmed
}

export function demoVenueSettings(workspaceId = '') {
  return {
    workspace_id: workspaceId,
    venue_lat: DEMO_VENUE_LAT,
    venue_lng: DEMO_VENUE_LNG,
    radius_m: 100,
    late_grace_minutes: 10,
    require_location: true,
    timezone: 'Europe/Nicosia',
  }
}

export function demoTodayShift({ employeeId = DEMO_CLOCK_EMPLOYEE_ID, todayKey = '', area = '' } = {}) {
  return {
    id: 'demo-elena-today',
    workspace_id: '',
    employee_id: employeeId,
    role: '',
    area,
    shift_date: todayKey,
    start_time: '16:00',
    end_time: '23:00',
  }
}

/**
 * Fill a missing venue pin and today's shift for the signed-in demo user.
 * Leaves real rows alone when they are already present.
 */
export function withDemoAttendance(snapshot, { employeeId = '', todayKey = '', area = '' } = {}) {
  const settings = venueLocationIsSet(snapshot?.settings)
    ? snapshot.settings
    : demoVenueSettings(snapshot?.settings?.workspace_id)
  const shifts = [...(snapshot?.shifts ?? [])]
  const mineToday = shifts.some((shift) => (
    `${shift?.employee_id ?? ''}` === `${employeeId}`
    && `${shift?.shift_date ?? ''}`.slice(0, 10) === todayKey
  ))
  if (employeeId && todayKey && !mineToday) {
    shifts.push(demoTodayShift({ employeeId, todayKey, area }))
  }
  return {
    settings,
    entries: snapshot?.entries ?? [],
    breaks: snapshot?.breaks ?? [],
    shifts,
  }
}
