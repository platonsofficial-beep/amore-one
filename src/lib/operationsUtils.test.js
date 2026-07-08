import { describe, expect, it } from 'vitest'
import {
  buildOperationsDashboardSummary,
  canStaffCompleteTask,
  getTaskAssigneeId,
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
})
