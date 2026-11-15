import { t } from '../i18n/i18n'
// All On shift / Today clock strings in one place, English for now.
// A Settings language switch can add a Greek table with the same keys later.
const ON_SHIFT_KEYS = {
  title: 'On shift',
  close: 'Close',
  filter: 'Filter',
  sortLabel: 'Sort',
  sortShift: 'Shift',
  sortDepartment: 'Department',
  sortName: 'Name',
  inNow: 'Clocked in',
  onBreak: 'On break',
  notIn: 'Not in yet',
  forgot: 'Forgot to clock out?',
  late: 'Late',
  lateArrival: 'Late',
  early: 'Early',
  startsIn: 'In',
  breakBadge: '☕ Break',
  inSince: 'In',
  shift: 'Shift',
  department: 'Department',
  position: 'Position',
  shiftToday: 'Shift today',
  clockIn: 'Clock in',
  notClockedIn: 'Not clocked in',
  working: 'Working',
  breaks: 'Breaks',
  none: 'None',
  statusOnBreak: '☕ On break',
  statusIn: '● Clocked in',
  statusLate: 'Not in yet · late',
  statusNotIn: 'Not in yet',
  emptyIn: 'Nobody is clocked in right now.',
  emptyBreak: 'Nobody is on a break right now.',
  emptyNotIn: 'Everyone with a shift today has arrived.',
  emptyForgot: 'No forgotten clock-outs.',
  loading: 'Loading…',
  teamMember: 'Team member',
  noShift: 'No shift',
  noDepartment: 'No department',
  noPosition: 'No position',
  everyone: 'Everyone',
}

export const ON_SHIFT_TEXT = new Proxy(ON_SHIFT_KEYS, {
  get(target, prop) {
    if (prop === 'lateCount') return (count) => t('{{count}} late', { count })
    if (prop === 'forgotCount') return (count) => t('{{count}} forgot to clock out', { count })
    if (prop === 'forgotSince') return (label) => t('Clocked in {{label}} · never clocked out', { label })
    const key = target[prop]
    return key ? t(key) : undefined
  },
})

/** Today card line for who is scheduled now and who has started. */
export function formatOnShiftSummary(scheduledNow, clockedIn) {
  const scheduled = Number(scheduledNow) || 0
  const parts = [t('{{count}} on shift', { count: scheduled })]
  if (Number.isFinite(clockedIn)) parts.push(t('{{count}} clocked in', { count: clockedIn }))
  return parts.join(' · ')
}
