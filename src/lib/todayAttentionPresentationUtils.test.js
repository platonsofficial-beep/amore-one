import { describe, expect, it } from 'vitest'
import {
  getTodayAttentionRowBadge,
  groupTodayAttentionItems,
  resolveTodayAttentionGroupId,
} from './todayAttentionPresentationUtils'

describe('todayAttentionPresentationUtils', () => {
  it('groups attention items by existing category and key metadata', () => {
    const groups = groupTodayAttentionItems([
      { key: 'stock:s1', category: 'stock', label: 'Black Label', detail: 'Low stock' },
      { key: 'reservation:r1', category: 'reservation', label: 'Marika', detail: 'Reservation service' },
      { key: 'schedule-issues', category: 'schedule', label: '4 schedule issues', detail: '4 shift gaps' },
      { key: 'task-due:2', category: 'task', priority: 'reminder', label: 'Prep list', detail: 'Due today' },
    ])

    expect(groups.map((group) => group.id)).toEqual([
      'needs-action',
      'reservation-service',
      'schedule',
      'operations',
    ])
    expect(groups[0].items).toHaveLength(1)
    expect(groups[1].items[0].label).toBe('Marika')
    expect(groups[2].items[0].detail).toBe('4 shift gaps')
  })

  it('places urgent overdue tasks in needs action', () => {
    expect(resolveTodayAttentionGroupId({
      key: 'task:9',
      category: 'task',
      priority: 'urgent',
    })).toBe('needs-action')

    expect(resolveTodayAttentionGroupId({
      key: 'task-due:2',
      category: 'task',
      priority: 'reminder',
    })).toBe('operations')
  })

  it('derives row badges from existing tone and priority only', () => {
    expect(getTodayAttentionRowBadge({ priority: 'urgent', tone: 'warning' })).toBe('Urgent')
    expect(getTodayAttentionRowBadge({ priority: 'reminder', tone: 'critical' })).toBe('Critical')
    expect(getTodayAttentionRowBadge({ priority: 'reminder', tone: 'info' })).toBe('')
  })
})
