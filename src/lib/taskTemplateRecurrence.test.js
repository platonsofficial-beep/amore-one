import { describe, expect, it } from 'vitest'
import { selectTemplatesDueForDate } from './taskTemplateRecurrence'

const TODAY = '2026-10-26'

describe('selectTemplatesDueForDate', () => {
  it('regenerates a daily template when the last task is from an earlier day', () => {
    const due = selectTemplatesDueForDate([
      { id: 'bar', title: 'bar opening', department: 'bar', recurrence: 'daily', isActive: true },
    ], [
      { title: 'bar opening', department: 'bar', dueDate: '2026-07-06', status: 'completed' },
    ], TODAY)

    expect(due.map((template) => template.id)).toEqual(['bar'])
  })

  it('skips a daily template that already has a task today', () => {
    const due = selectTemplatesDueForDate([
      { id: 'bar', title: 'bar opening', department: 'bar', recurrence: 'daily' },
    ], [
      { title: 'bar opening', department: 'bar', dueDate: TODAY },
    ], TODAY)

    expect(due).toEqual([])
  })

  it('does not recreate a weekly template that already ran this week', () => {
    const due = selectTemplatesDueForDate([
      { id: 'week', title: 'deep clean', department: 'service', recurrence: 'weekly' },
    ], [
      { title: 'deep clean', department: 'service', dueDate: '2026-10-27' },
    ], TODAY)

    expect(due).toEqual([])
  })

  it('regenerates a weekly template from a previous week without backfilling missed days', () => {
    const due = selectTemplatesDueForDate([
      { id: 'week', title: 'deep clean', department: 'service', recurrence: 'weekly' },
    ], [
      { title: 'deep clean', department: 'service', dueDate: '2026-10-20' },
    ], TODAY)

    expect(due.map((template) => template.id)).toEqual(['week'])
  })

  it('skips inactive templates', () => {
    const due = selectTemplatesDueForDate([
      { id: 'off', title: 'bar opening', department: 'bar', recurrence: 'daily', isActive: false },
    ], [], TODAY)

    expect(due).toEqual([])
  })
})
