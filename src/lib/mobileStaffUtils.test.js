import { describe, expect, it } from 'vitest'
import {
  calculateMobileOperationsTaskOverview,
  getMobileOperationsStaffOwnershipLabel,
  getMobileOperationsTaskStatusLabel,
  getMobileStaffTaskTabEmptyState,
  groupMobileStaffPendingTasks,
  partitionMobileOperationsTasks,
} from './mobileStaffUtils'

const TODAY = '2026-07-08'
const EMPLOYEE_ID = 'emp-1'

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

describe('mobileStaffUtils task workflow', () => {
  it('labels ownership for staff tasks', () => {
    expect(getMobileOperationsStaffOwnershipLabel(task(), EMPLOYEE_ID)).toBe('Team task')
    expect(getMobileOperationsStaffOwnershipLabel(
      task({ assignedTo: EMPLOYEE_ID }),
      EMPLOYEE_ID,
    )).toBe('Assigned to you')
  })

  it('labels overdue and completed status', () => {
    expect(getMobileOperationsTaskStatusLabel(task({ dueDate: '2026-07-07' }), TODAY)).toBe('Overdue')
    expect(getMobileOperationsTaskStatusLabel(task({ status: 'completed' }), TODAY)).toBe('Completed')
    expect(getMobileOperationsTaskStatusLabel(task(), TODAY)).toBe('Pending')
  })

  it('groups pending tasks into overdue and due today', () => {
    const groups = groupMobileStaffPendingTasks([
      task({ id: 'overdue', dueDate: '2026-07-07' }),
      task({ id: 'today', dueDate: TODAY }),
    ], TODAY)

    expect(groups.overdue.map((item) => item.id)).toEqual(['overdue'])
    expect(groups.dueToday.map((item) => item.id)).toEqual(['today'])
  })

  it('partitions and prioritizes pending operations tasks', () => {
    const groups = partitionMobileOperationsTasks([
      task({ id: 'future', dueDate: '2026-07-10', priority: 'low' }),
      task({ id: 'overdue', dueDate: '2026-07-07', priority: 'urgent' }),
      task({ id: 'today', dueDate: TODAY, priority: 'high' }),
      task({ id: 'done', status: 'completed', dueDate: TODAY }),
    ], TODAY)

    expect(groups.upcoming.map((item) => item.id)).toEqual(['future'])
    expect(groups.pending.map((item) => item.id)).toEqual(['overdue', 'today'])
    expect(groups.completed.map((item) => item.id)).toEqual(['done'])
  })

  it('builds task overview with status message', () => {
    const overview = calculateMobileOperationsTaskOverview([
      task({ id: 'overdue', dueDate: '2026-07-07' }),
      task({ id: 'today', dueDate: TODAY }),
      task({ id: 'done', status: 'completed', dueDate: TODAY, completedAt: `${TODAY}T12:00:00` }),
    ], TODAY)

    expect(overview.overdue).toBe(1)
    expect(overview.active).toBe(2)
    expect(overview.completedToday).toBe(1)
    expect(overview.statusMessage).toBe('1 overdue')
  })

  it('returns contextual empty states', () => {
    expect(getMobileStaffTaskTabEmptyState('pending').title).toBe('You are caught up')
    expect(getMobileStaffTaskTabEmptyState('upcoming').title).toBe('No upcoming tasks')
  })
})
