import { describe, expect, it } from 'vitest'
import { calculateTaskOverview } from './taskUtils'
import {
  buildSharedTaskWindow,
  combineOperationalTasks,
  sharedWindowMatchesTaskOverview,
} from './sharedTaskWindow'

const TODAY = '2026-10-26'

describe('combineOperationalTasks', () => {
  it('counts workspace tasks and past-due checklist tasks with the Today definition', () => {
    const workspaceTasks = [
      { id: 3, title: 'Bar order', status: 'active', dueDate: '2026-07-05', department: 'bar', assignedEmployeeId: 'emp-1' },
      { id: 6, title: 'Morning service', status: 'active', dueDate: '2026-07-06', department: 'service' },
      { id: 7, title: 'Service clean', status: 'active', dueDate: '2026-07-08', department: 'service' },
      { id: 2, title: 'Done', status: 'completed', dueDate: '2026-07-05', completedAt: '2026-07-05T10:00:00.000Z' },
    ]
    const operationsTasks = [
      { id: 'c1', title: 'Open machine', status: 'pending', dueDate: '2026-07-07', checklistTemplateId: 'tpl-1' },
      { id: 'c2', title: 'Fill blends', status: 'pending', dueDate: '2026-07-07', checklistTemplateId: 'tpl-1' },
      { id: 'c3', title: 'Wash plates', status: 'pending', dueDate: '2026-07-07', checklistTemplateId: 'tpl-1' },
      { id: 'today-check', title: 'Today checklist', status: 'pending', dueDate: TODAY, checklistTemplateId: 'tpl-1' },
      { id: 'done-op', title: 'Finished note', status: 'completed', dueDate: '2026-07-01', completedAt: '2026-07-01T09:00:00.000Z' },
    ]

    const combined = combineOperationalTasks(workspaceTasks, operationsTasks, TODAY)
    const overview = calculateTaskOverview(combined, TODAY)
    const window = buildSharedTaskWindow(combined, TODAY)

    expect(combined.map((task) => task.id)).toEqual([3, 6, 7, 2, 'c1', 'c2', 'c3', 'done-op'])
    expect(overview.active).toBe(6)
    expect(overview.overdue).toBe(6)
    expect(window.openCount).toBe(6)
    expect(window.pastDueCount).toBe(6)
    expect(window.listTasks.map((task) => task.id)).toEqual([3, 6, 'c1', 'c2', 'c3', 7])
    expect(sharedWindowMatchesTaskOverview(combined, TODAY, overview)).toBe(true)
  })

  it('does not hide past-due operations tasks behind a due-today list', () => {
    const operationsTasks = [
      { id: 'late', title: 'Late standalone', status: 'pending', dueDate: '2026-10-01' },
    ]
    const window = buildSharedTaskWindow(
      combineOperationalTasks([], operationsTasks, TODAY),
      TODAY,
    )

    expect(window.dueTodayCount).toBe(0)
    expect(window.pastDueCount).toBe(1)
    expect(window.listTasks.map((task) => task.title)).toEqual(['Late standalone'])
  })
})
