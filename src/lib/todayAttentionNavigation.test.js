import { describe, expect, it } from 'vitest'
import {
  buildOperationsTaskAttentionItems,
  formatTodayAttentionActionLabel,
  getTodayAttentionItemA11y,
  isTodayAttentionItemActionable,
  resolveTodayAttentionDestination,
} from './todayAttentionNavigation'

const fullPermissions = {
  canViewStock: true,
  canViewTasks: true,
  canViewSchedule: true,
  canViewReservations: true,
}

const noPermissions = {
  canViewStock: false,
  canViewTasks: false,
  canViewSchedule: false,
  canViewReservations: false,
}

describe('todayAttentionNavigation', () => {
  it('resolves stock destinations', () => {
    expect(resolveTodayAttentionDestination(
      { key: 'stock:12' },
      fullPermissions,
    )).toEqual({ view: 'stock', section: 'dashboard' })

    expect(resolveTodayAttentionDestination(
      { key: 'stock-module:low' },
      fullPermissions,
    )).toEqual({ view: 'stock', section: 'dashboard' })
  })

  it('resolves supplier order destinations', () => {
    expect(resolveTodayAttentionDestination(
      { key: 'orders:awaiting' },
      fullPermissions,
    )).toEqual({
      view: 'stock',
      section: 'orders',
      action: 'receive-deliveries',
    })

    expect(resolveTodayAttentionDestination(
      { key: 'orders:draft' },
      fullPermissions,
    )).toEqual({ view: 'stock', section: 'orders' })
  })

  it('resolves task destinations with task id', () => {
    expect(resolveTodayAttentionDestination(
      { key: 'task:42' },
      fullPermissions,
    )).toEqual({ view: 'operations', section: 'dashboard', taskId: '42' })

    expect(resolveTodayAttentionDestination(
      { key: 'task-due:7' },
      fullPermissions,
    )).toEqual({ view: 'operations', section: 'dashboard', taskId: '7' })
  })

  it('builds operations task attention items from operations tasks', () => {
    const items = buildOperationsTaskAttentionItems([
      { id: 'o1', title: 'Overdue prep', status: 'pending', dueDate: '2026-07-07' },
      { id: 'o2', title: 'Count safe', status: 'pending', dueDate: '2026-07-08' },
      { id: 'o3', title: 'Done task', status: 'completed', dueDate: '2026-07-08' },
    ], '2026-07-08')

    expect(items).toEqual([
      {
        key: 'task:o1',
        category: 'task',
        tone: 'warning',
        priority: 'urgent',
        label: 'Overdue prep',
        detail: 'Overdue task',
      },
      {
        key: 'task-due:o2',
        category: 'task',
        tone: 'info',
        priority: 'reminder',
        label: 'Count safe',
        detail: 'Due today',
      },
    ])
  })

  it('resolves schedule and reservation destinations', () => {
    expect(resolveTodayAttentionDestination(
      { key: 'schedule-issues' },
      fullPermissions,
    )).toEqual({ view: 'team', section: 'schedule' })

    expect(resolveTodayAttentionDestination(
      { key: 'reservation:service-pressure' },
      fullPermissions,
    )).toEqual({ view: 'reservations' })

    expect(resolveTodayAttentionDestination(
      { key: 'reservation:alert-late-r1-0', reservationId: 'r1' },
      fullPermissions,
    )).toEqual({
      view: 'reservations',
      action: 'host',
      reservationId: 'r1',
    })
  })

  it('resolves announcement destination to today announcements', () => {
    expect(resolveTodayAttentionDestination(
      { key: 'announcement:a1' },
      fullPermissions,
    )).toEqual({
      view: 'today',
      action: 'announcements',
      announcementId: 'a1',
    })
  })

  it('returns null when destination is not permitted', () => {
    expect(resolveTodayAttentionDestination({ key: 'stock:1' }, noPermissions)).toBeNull()
    expect(resolveTodayAttentionDestination({ key: 'task:1' }, noPermissions)).toBeNull()
    expect(resolveTodayAttentionDestination({ key: 'schedule-issues' }, noPermissions)).toBeNull()
    expect(resolveTodayAttentionDestination({ key: 'reservation:x' }, noPermissions)).toBeNull()
  })

  it('marks items actionable only when a destination exists', () => {
    expect(isTodayAttentionItemActionable({ key: 'task:1' }, fullPermissions)).toBe(true)
    expect(isTodayAttentionItemActionable({ key: 'task:1' }, noPermissions)).toBe(false)
    expect(isTodayAttentionItemActionable({ key: 'announcement:a1' }, noPermissions)).toBe(true)
    expect(isTodayAttentionItemActionable({ key: 'unknown' }, fullPermissions)).toBe(false)
  })

  it('formats descriptive action labels for screen readers', () => {
    expect(formatTodayAttentionActionLabel(
      { label: 'Olive oil', detail: 'Out of stock' },
      { view: 'stock', section: 'dashboard' },
    )).toBe('Open stock: Olive oil. Out of stock')

    expect(formatTodayAttentionActionLabel(
      { label: '2 deliveries to receive', detail: 'Sent supplier orders waiting' },
      { view: 'stock', section: 'orders', action: 'receive-deliveries' },
    )).toBe('Receive deliveries: 2 deliveries to receive. Sent supplier orders waiting')

    expect(formatTodayAttentionActionLabel(
      { label: 'Close checklist', detail: 'Overdue task' },
      { view: 'operations', section: 'dashboard', taskId: '7' },
    )).toBe('Open task: Close checklist. Overdue task')
  })

  it('builds a11y metadata from item and permissions', () => {
    const metadata = getTodayAttentionItemA11y(
      { key: 'schedule-issues', label: '2 schedule issues', detail: 'Review coverage' },
      fullPermissions,
    )

    expect(metadata.isActionable).toBe(true)
    expect(metadata.destination).toEqual({ view: 'team', section: 'schedule' })
    expect(metadata.actionLabel).toBe('Open schedule: 2 schedule issues. Review coverage')
  })
})
