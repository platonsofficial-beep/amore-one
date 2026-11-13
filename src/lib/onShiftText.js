import { t } from '../i18n/i18n'
// All On shift / Today clock strings in one place, English for now.
// A Settings language switch can add a Greek table with the same keys later.
export const ON_SHIFT_TEXT = {
  title: t("On shift"),
  close: 'Close',
  filter: 'Filter',
  sortLabel: 'Sort',
  sortShift: 'Shift',
  sortDepartment: 'Department',
  sortName: 'Name',
  inNow: t("Clocked in"),
  onBreak: t("On break"),
  notIn: t("Not in yet"),
  lateCount: (n) => `${n} late`,
  forgot: t("Forgot to clock out?"),
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
  shiftToday: t("Shift today"),
  clockIn: t("Clock in"),
  notClockedIn: t("Not clocked in"),
  working: 'Working',
  breaks: 'Breaks',
  none: 'None',
  statusOnBreak: '☕ On break',
  statusIn: '● Clocked in',
  statusLate: t("Not in yet · late"),
  statusNotIn: t("Not in yet"),
  emptyIn: t("Nobody is clocked in right now."),
  emptyBreak: t("Nobody is on a break right now."),
  emptyNotIn: t("Everyone with a shift today has arrived."),
  emptyForgot: t("No forgotten clock-outs."),
  loading: 'Loading…',
  teamMember: t("Team member"),
  noShift: t("No shift"),
  noDepartment: t("No department"),
  noPosition: t("No position"),
  everyone: 'Everyone',
}

/** "3 on shift · 1 clocked in": the same line on the Today card and in the sheet. */
export function formatOnShiftSummary(scheduledNow, clockedIn) {
  const scheduled = Number(scheduledNow) || 0
  const parts = [`${scheduled} on shift`]
  if (Number.isFinite(clockedIn)) parts.push(`${clockedIn} clocked in`)
  return parts.join(' · ')
}
