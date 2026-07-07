import { normalizeOperationsStatus, normalizeOperationsTaskDate } from './operationsUtils'

export const CHECKLIST_DEPARTMENTS = ['bar', 'service', 'kitchen', 'management']

const DEPARTMENT_LABELS = {
  bar: 'Bar',
  service: 'Service',
  kitchen: 'Kitchen',
  management: 'Management',
}

const DEPARTMENT_CATEGORY_MAP = {
  bar: 'bar',
  service: 'service',
  kitchen: 'kitchen',
  management: 'other',
}

export function normalizeChecklistDepartment(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return CHECKLIST_DEPARTMENTS.includes(normalized) ? normalized : 'service'
}

export function getChecklistDepartmentLabel(department) {
  return DEPARTMENT_LABELS[normalizeChecklistDepartment(department)] ?? 'Service'
}

export function inferChecklistCategory(templateName = '', department = 'service') {
  const normalizedName = `${templateName ?? ''}`.trim().toLowerCase()
  if (normalizedName.includes('opening')) return 'opening'
  if (normalizedName.includes('closing')) return 'closing'
  if (normalizedName.includes('prep')) return 'kitchen'
  if (normalizedName.includes('clean')) return 'cleaning'
  return DEPARTMENT_CATEGORY_MAP[normalizeChecklistDepartment(department)] ?? 'other'
}

export function buildEmptyChecklistTemplateForm() {
  return {
    name: '',
    department: 'service',
    active: true,
  }
}

export function buildEmptyChecklistItemForm(orderIndex = 0) {
  return {
    title: '',
    description: '',
    orderIndex,
    required: true,
    estimatedMinutes: '',
  }
}

export function validateChecklistTemplateForm(form) {
  if (!`${form.name ?? ''}`.trim()) {
    return 'Please enter a checklist name.'
  }
  return ''
}

export function validateChecklistItemForm(form) {
  if (!`${form.title ?? ''}`.trim()) {
    return 'Please enter a task title.'
  }
  return ''
}

export function sortChecklistItems(items = []) {
  return [...(items ?? [])].sort((left, right) => {
    const leftIndex = Number(left.orderIndex ?? left.order_index ?? 0)
    const rightIndex = Number(right.orderIndex ?? right.order_index ?? 0)
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return `${left.title ?? ''}`.localeCompare(`${right.title ?? ''}`, undefined, { sensitivity: 'base' })
  })
}

export function reorderChecklistItems(items = [], itemId, direction) {
  const sorted = sortChecklistItems(items)
  const currentIndex = sorted.findIndex((item) => `${item.id}` === `${itemId}`)
  if (currentIndex < 0) return sorted

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= sorted.length) return sorted

  const next = [...sorted]
  const [moved] = next.splice(currentIndex, 1)
  next.splice(targetIndex, 0, moved)

  return next.map((item, index) => ({
    ...item,
    orderIndex: index,
  }))
}

export function moveChecklistItemByDrag(items = [], draggedId, targetId) {
  if (!draggedId || !targetId || `${draggedId}` === `${targetId}`) {
    return sortChecklistItems(items)
  }

  const sorted = sortChecklistItems(items)
  const draggedIndex = sorted.findIndex((item) => `${item.id}` === `${draggedId}`)
  const targetIndex = sorted.findIndex((item) => `${item.id}` === `${targetId}`)
  if (draggedIndex < 0 || targetIndex < 0) return sorted

  const next = [...sorted]
  const [moved] = next.splice(draggedIndex, 1)
  next.splice(targetIndex, 0, moved)

  return next.map((item, index) => ({
    ...item,
    orderIndex: index,
  }))
}

export function buildChecklistProgressRows(templates = [], tasks = [], todayKey = '') {
  const normalizedToday = normalizeOperationsTaskDate(todayKey)
  const activeTemplates = (templates ?? []).filter((template) => template.active !== false)

  return activeTemplates.map((template) => {
    const templateTasks = (tasks ?? []).filter((task) => (
      `${task.checklistTemplateId ?? ''}` === `${template.id}`
      && normalizeOperationsTaskDate(task.dueDate) === normalizedToday
    ))

    const total = templateTasks.length
    const completed = templateTasks.filter(
      (task) => normalizeOperationsStatus(task.status) === 'completed',
    ).length

    let status = 'not_started'
    if (total > 0 && completed >= total) {
      status = 'complete'
    } else if (completed > 0) {
      status = 'in_progress'
    } else if (total > 0) {
      status = 'in_progress'
    }

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0

    return {
      templateId: template.id,
      templateName: template.name,
      department: template.department,
      departmentLabel: getChecklistDepartmentLabel(template.department),
      itemCount: template.items?.length ?? 0,
      total,
      completed,
      percent,
      status,
      started: total > 0,
    }
  })
}

export function formatChecklistProgressLabel(row) {
  if (!row?.started) return 'Not started'
  if (row.status === 'complete') return 'Complete'
  return `${row.percent}%`
}

export function getChecklistTasksForTemplate(tasks = [], templateId, todayKey = '') {
  const normalizedToday = normalizeOperationsTaskDate(todayKey)
  return sortChecklistItems(
    (tasks ?? [])
      .filter((task) => (
        `${task.checklistTemplateId ?? ''}` === `${templateId}`
        && normalizeOperationsTaskDate(task.dueDate) === normalizedToday
      ))
      .map((task) => ({
        ...task,
        orderIndex: task.checklistOrderIndex ?? 0,
      })),
  )
}

export function filterStandaloneOperationsTasks(tasks = []) {
  return (tasks ?? []).filter((task) => !task.checklistTemplateId)
}

export function formatChecklistCompletionMeta(task) {
  if (!task?.completedAt) return null
  const completedBy = task.completedByName || 'Team member'
  const timeLabel = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(task.completedAt))

  return `${completedBy} · ${timeLabel}`
}
