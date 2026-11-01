// All On shift / Today clock strings in one place, English for now.
// A Settings language switch can add a Greek table with the same keys later.
export const ON_SHIFT_TEXT = {
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
  lateCount: (n) => `${n} late`,
  forgot: 'Forgot to clock out?',
  forgotCount: (n) => `${n} forgot to clock out`,
  forgotSince: (label) => `Clocked in ${label} · never clocked out`,
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

/** "3 on shift · 1 clocked in": the same line on the Today card and in the sheet. */
export function formatOnShiftSummary(scheduledNow, clockedIn) {
  const scheduled = Number(scheduledNow) || 0
  const parts = [`${scheduled} on shift`]
  if (Number.isFinite(clockedIn)) parts.push(`${clockedIn} clocked in`)
  return parts.join(' · ')
}
