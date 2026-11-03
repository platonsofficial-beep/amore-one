import { describe, expect, it } from 'vitest'
import { mergeChecklistRunsIntoTasks } from './checklistRunModel'

const run = (extra = {}) => ({
  id: 'r1', templateId: 't1', dueDate: '2026-11-03', title: 'TEST checklist 0033',
  steps: [{ id: 's1', title: 'Step', status: 'pending', orderIndex: 0 }], ...extra,
})

describe('0034 checklist run department', () => {
  it('uses the run template department when no template list is passed', () => {
    const [task] = mergeChecklistRunsIntoTasks([], [run({ templateDepartment: 'bar' })])
    expect(task.category).toBe('bar')
  })
  it('still prefers the template list when present', () => {
    const [task] = mergeChecklistRunsIntoTasks([], [run({ templateDepartment: 'bar' })], [{ id: 't1', name: 'X', department: 'kitchen' }])
    expect(task.category).toBe('kitchen')
  })
  it('keeps the old service fallback when nothing is known', () => {
    const [task] = mergeChecklistRunsIntoTasks([], [run()])
    expect(task.category).toBe('service')
  })
})
