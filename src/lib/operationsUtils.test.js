import { describe, expect, it } from 'vitest'
import { translate } from '../i18n/i18n'
import { TASK_PRESET_DEPARTMENTS } from './taskDepartments'
import {
  buildOperationsDashboardSummary,
  buildOperationsTaskSubmitPayload,
  canStaffCompleteTask,
  getOperationsCategoryLabel,
  getOperationsPriorityLabel,
  getTaskAssigneeId,
  operationsTaskToForm,
  resolveEmployeeName,
  validateOperationsTaskForm,
} from './operationsUtils'

const TODAY = '2026-07-08'

function task(overrides = {}) {
  return {
    id: 't1',
    title: 'Task',
    status: 'pending',
    priority: 'normal',
    dueDate: TODAY,
    ...overrides,
  }
}

describe('operations labels', () => {
  it('translates categories, priorities, and unassigned', () => {
    expect(getOperationsCategoryLabel('bar')).toBe('Bar')
    expect(getOperationsPriorityLabel('low')).toBe('Low')
    expect(resolveEmployeeName('', [])).toBe('Unassigned')
    expect(translate('Service', undefined, 'el')).toBe('Σερβίρισμα')
    expect(translate('Category opening', undefined, 'el')).toBe('Άνοιγμα')
    expect(translate('Task priority high', undefined, 'el')).toBe('Υψηλή')
    expect(translate('Unassigned', undefined, 'el')).toBe('Χωρίς ανάθεση')
    expect(translate('{{count}} task', { count: 5 }, 'el')).toBe('5 εργασίες')
    expect(translate('{{count}} task', { count: 1 }, 'el')).toBe('1 εργασία')
    expect(translate('{{count}} active', { count: 2 }, 'el')).toBe('ενεργές')
    expect(translate('{{count}} active', { count: 1 }, 'el')).toBe('ενεργή')
    expect(translate('{{done}}/{{total}} completed', { done: 0, total: 1, count: 1 }, 'el')).toBe('0/1 ολοκληρώθηκε')
    expect(translate('{{done}} of {{total}} complete', { done: 0, total: 2, count: 2 }, 'el')).toBe('0 από 2 έτοιμα')
    expect(translate('{{done}} of {{total}} complete', { done: 1, total: 1, count: 1 }, 'el')).toBe('1 από 1 έτοιμο')
    expect(translate('Assign to', undefined, 'el')).toBe('Ανάθεση σε')
    expect(translate('{{count}} task', { count: 5 }, 'en')).toBe('5 tasks')
  })

  it('agrees department-card counts and translates preset board names', () => {
    expect(translate('{{count}} card completed today', { count: 1 }, 'el')).toBe('Ολοκληρώθηκε σήμερα')
    expect(translate('{{count}} card completed today', { count: 0 }, 'el')).toBe('Ολοκληρώθηκαν σήμερα')
    expect(translate('{{count}} card completed today', { count: 2 }, 'el')).toBe('Ολοκληρώθηκαν σήμερα')
    expect(translate('{{count}} card overdue', { count: 1 }, 'el')).toBe('Εκπρόθεσμη')
    expect(translate('{{count}} card overdue', { count: 0 }, 'el')).toBe('Εκπρόθεσμες')
    expect(translate('{{count}} card overdue', { count: 2 }, 'el')).toBe('Εκπρόθεσμες')
    expect(translate('{{count}} card completed today', { count: 1 }, 'en')).toBe('Completed today')
    expect(translate('{{count}} card completed today', { count: 2 }, 'en')).toBe('Completed today')
    expect(translate('{{count}} card overdue', { count: 1 }, 'en')).toBe('Overdue')
    expect(translate('{{count}} card overdue', { count: 2 }, 'en')).toBe('Overdue')
    expect(translate('Bar Manager', undefined, 'el')).toBe('Υπεύθυνος Μπαρ')
    expect(translate('Bar Manager', undefined, 'en')).toBe('Bar Manager')
    expect(translate('F&B', undefined, 'el')).toBe('Τροφοδοσία & Ποτά')
    expect(translate('F&B', undefined, 'en')).toBe('F&B')
    expect(translate('Logistics', undefined, 'el')).toBe('Εφοδιασμός')
    expect(translate('Logistics', undefined, 'en')).toBe('Logistics')
    expect(translate('Add Kitchen, Cleaning, Delivery, or any custom team.', undefined, 'el'))
      .toBe('Πρόσθεσε Κουζίνα, Καθαριότητα, Διανομή ή όποια ομάδα θέλεις.')
    expect(translate('Add Kitchen, Cleaning, Delivery, or any custom team.', undefined, 'en'))
      .toBe('Add Kitchen, Cleaning, Delivery, or any custom team.')
    const labels = Object.fromEntries(TASK_PRESET_DEPARTMENTS.map((department) => [department.key, department.label]))
    expect(labels.bar_manager).toBe('Bar Manager')
    expect(labels.floor_manager).toBe('Floor Manager')
    expect(labels.fb).toBe('F&B')
    expect(labels.logistics).toBe('Logistics')
  })
})

describe('operationsUtils task completion scope', () => {
  describe('getTaskAssigneeId', () => {
    it.each([
      [{ assignedTo: '42' }, '42'],
      [{ assigned_to: '42' }, '42'],
      [{ assignedEmployeeId: '7' }, '7'],
      [{ assigned_employee_id: '7' }, '7'],
      [{ assignedTo: '42', assignedEmployeeId: '7' }, '42'],
      [{}, null],
    ])('resolves assignee from %o', (taskInput, expected) => {
      expect(getTaskAssigneeId(taskInput)).toBe(expected)
    })
  })

  describe('canStaffCompleteTask', () => {
    it('allows staff to complete unassigned tasks', () => {
      expect(canStaffCompleteTask({ assignedEmployeeId: null }, 'staff-1')).toBe(true)
      expect(canStaffCompleteTask({}, null)).toBe(true)
    })

    it('allows staff to complete tasks assigned to them', () => {
      expect(canStaffCompleteTask({ assignedTo: 'staff-1' }, 'staff-1')).toBe(true)
      expect(canStaffCompleteTask({ assignedEmployeeId: 'staff-1' }, 'staff-1')).toBe(true)
    })

    it('blocks staff from completing tasks assigned to someone else', () => {
      expect(canStaffCompleteTask({ assignedTo: 'other-1' }, 'staff-1')).toBe(false)
      expect(canStaffCompleteTask({ assignedEmployeeId: 'other-1' }, 'staff-1')).toBe(false)
    })

    it('blocks staff without a linked employee from completing assigned tasks', () => {
      expect(canStaffCompleteTask({ assignedTo: 'staff-1' }, null)).toBe(false)
      expect(canStaffCompleteTask({ assignedEmployeeId: 'staff-1' }, '')).toBe(false)
    })
  })
})

describe('buildOperationsDashboardSummary', () => {
  it('counts overdue pending tasks across all loaded dates', () => {
    const summary = buildOperationsDashboardSummary([
      task({ id: 'overdue', dueDate: '2026-07-07' }),
      task({ id: 'today-open', dueDate: TODAY }),
      task({ id: 'today-done', dueDate: TODAY, status: 'completed' }),
      task({ id: 'future', dueDate: '2026-07-10' }),
    ], [], TODAY)

    expect(summary.overdueTasks).toBe(1)
    expect(summary.openTasks).toBe(1)
    expect(summary.completedToday).toBe(1)
  })

  it('counts issue logs as urgent issues', () => {
    const summary = buildOperationsDashboardSummary([], [
      { id: 'issue', type: 'incident', message: 'Walk-in overflow' },
      { id: 'note', type: 'note', message: 'Handover' },
    ], TODAY)

    expect(summary.urgentIssues).toBe(1)
    expect(summary.teamNotes).toBe(1)
  })
})

describe('operations task steps form', () => {
  it('keeps step titles on the submit payload and drops blank rows', () => {
    expect(buildOperationsTaskSubmitPayload({
      title: ' Close bar ',
      description: ' Night ',
      category: 'closing',
      priority: 'normal',
      assignedTo: '',
      dueDate: '2026-10-26',
      dueTime: '',
      steps: [
        { id: 'step-1', title: ' Wipe ' },
        { id: '', title: '   ' },
        { title: 'Lock' },
      ],
    })).toMatchObject({
      title: 'Close bar',
      description: 'Night',
      assignedTo: null,
      steps: [
        { id: 'step-1', title: 'Wipe' },
        { id: null, title: 'Lock' },
      ],
    })
  })

  it('asks for a due date when steps are present', () => {
    expect(validateOperationsTaskForm({
      title: 'Close bar',
      dueDate: '',
      steps: [{ title: 'Lock' }],
    })).toBe('Add a due date to save checklist steps.')
  })

  it('loads saved steps into the edit form', () => {
    expect(operationsTaskToForm({
      title: 'Close bar',
      category: 'closing',
      priority: 'normal',
      dueDate: '2026-10-26',
      checklistSteps: [
        { runStepId: 'step-1', title: 'Wipe' },
      ],
    }).steps).toEqual([
      { id: 'step-1', title: 'Wipe', key: 'step-1' },
    ])
  })
})
