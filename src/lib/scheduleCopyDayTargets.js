import { addWeeks, getWeekDays, getWeekStartDate } from './weekUtils'

const GROUP_LABELS = ['This week', 'Next week', 'Following week']

/**
 * Days the Copy Day dialog can target. Includes the open week and the
 * following weeks, and leaves the source day out.
 */
export function buildCopyDayTargetGroups({
  weekStartDate = '',
  sourceDate = '',
  weeksAhead = 2,
} = {}) {
  const start = `${weekStartDate ?? ''}`.trim()
  if (!start) return []

  const source = `${sourceDate ?? ''}`.trim()
  const ahead = Math.max(0, Math.trunc(Number(weeksAhead) || 0))
  const weekStart = getWeekStartDate(start)

  return Array.from({ length: ahead + 1 }, (_, index) => {
    const groupStart = index === 0 ? weekStart : addWeeks(weekStart, index)
    return {
      weekStart: groupStart,
      label: GROUP_LABELS[index] || `Week +${index}`,
      days: getWeekDays(groupStart).filter((day) => day.key !== source),
    }
  }).filter((group) => group.days.length > 0)
}
