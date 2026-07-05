import { getTodayKey } from './taskUtils'

export function buildTaskForm(task = null, defaultDepartment = 'service') {
  return {
    title: task?.title ?? '',
    department: task?.department ?? defaultDepartment,
    departmentCustom: task?.departmentCustom ?? '',
    assignedEmployeeId: task?.assignedEmployeeId ? String(task.assignedEmployeeId) : '',
    priority: task?.priority ?? 'normal',
    dueDate: task?.dueDate ?? getTodayKey(),
    dueTime: task?.dueTime ?? '',
    recurrence: task?.recurrence ?? 'none',
    notes: task?.notes ?? '',
  }
}

export function buildTaskTemplateForm(template = null) {
  return {
    title: template?.title ?? '',
    department: template?.department ?? 'service',
    departmentCustom: template?.departmentCustom ?? '',
    priority: template?.priority ?? 'normal',
    defaultTime: template?.defaultTime ?? '',
    recurrence: template?.recurrence ?? 'daily',
    notes: template?.notes ?? '',
  }
}
