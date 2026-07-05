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
