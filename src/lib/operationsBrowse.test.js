import { describe, expect, it } from 'vitest'
import {
  compareOperationsTasksByWorkflow,
  isOperationsTaskOverdue,
  sortOperationsTasks,
} from './operationsBrowse'

const TODAY = '2026-07-08'

function task(overrides = {}) {
  return {
    id: 't1',
    title: 'Task',
    status: 'pending',
    priority: 'normal',
    dueDate: TODAY,
    dueTime: '10:00',
    ...overrides,
  }
}

describe('operationsBrowse task workflow', () => {
  it('detects overdue operations tasks', () => {
    expect(isOperationsTaskOverdue(task({ dueDate: '2026-07-07' }), TODAY)).toBe(true)
    expect(isOperationsTaskOverdue(task({ dueDate: TODAY }), TODAY)).toBe(false)
    expect(isOperationsTaskOverdue(task({ status: 'completed', dueDate: '2026-07-07' }), TODAY)).toBe(false)
  })

  it('sorts by overdue, priority, and due time', () => {
    const sorted = [
      task({ id: 'a', title: 'Normal today', priority: 'normal', dueTime: '12:00' }),
      task({ id: 'b', title: 'Overdue urgent', priority: 'urgent', dueDate: '2026-07-07', dueTime: '09:00' }),
      task({ id: 'c', title: 'Today high', priority: 'high', dueTime: '08:00' }),
    ].sort((left, right) => compareOperationsTasksByWorkflow(left, right, TODAY))

    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps pending tasks before completed tasks in sortOperationsTasks', () => {
    const sorted = sortOperationsTasks([
      task({ id: 'done', status: 'completed' }),
      task({ id: 'open', status: 'pending', priority: 'urgent' }),
    ])

    expect(sorted.map((item) => item.id)).toEqual(['open', 'done'])
  })
})
