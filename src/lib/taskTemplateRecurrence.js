function normalizeDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  return raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10)
}

function taskIdentity(title, department) {
  return `${`${title ?? ''}`.trim().toLowerCase()}::${`${department ?? ''}`.trim().toLowerCase()}`
}

function mondayKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return ''
  const cursor = new Date(year, month - 1, day, 12, 0, 0, 0)
  const weekday = cursor.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  cursor.setDate(cursor.getDate() + diff)
  const nextMonth = String(cursor.getMonth() + 1).padStart(2, '0')
  const nextDay = String(cursor.getDate()).padStart(2, '0')
  return `${cursor.getFullYear()}-${nextMonth}-${nextDay}`
}

function samePeriod(recurrence, leftDate, rightDate) {
  if (!leftDate || !rightDate) return false
  if (recurrence === 'weekly') return mondayKey(leftDate) === mondayKey(rightDate)
  if (recurrence === 'monthly') return leftDate.slice(0, 7) === rightDate.slice(0, 7)
  return leftDate === rightDate
}

/**
 * Templates that still need a task for the selected date.
 * Daily templates are due when none exist today. Weekly and monthly templates
 * are due when none exist in the current week or month. Missed days are not backfilled.
 */
export function selectTemplatesDueForDate(templates = [], tasks = [], selectedDate = '') {
  const dueDate = normalizeDateKey(selectedDate)
  if (!dueDate) return []

  return (templates ?? []).filter((template) => {
    if (!template || template.isActive === false) return false
    const recurrence = `${template.recurrence ?? 'daily'}`.trim().toLowerCase()
    const identity = taskIdentity(template.title, template.department)
    const alreadyExists = (tasks ?? []).some((task) => {
      if (taskIdentity(task?.title, task?.department) !== identity) return false
      return samePeriod(recurrence, normalizeDateKey(task?.dueDate ?? task?.due_date), dueDate)
    })
    return !alreadyExists
  })
}
