import { describe, expect, it } from 'vitest'
import { getChecklistTasksForTemplate } from './operationsChecklistUtils'
import { collapseChecklistRuns } from './sharedTaskWindow'
import {
  checklistRunFallbackError,
  isChecklistRunShapeNotReady,
  isChecklistRunStorageUnavailable,
  mergeChecklistRunsIntoTasks,
  planDailyChecklistStart,
} from './checklistRunModel'

const TODAY = '2026-10-26'

describe('mergeChecklistRunsIntoTasks', () => {
  const operationsTasks = [
    { id: 'step-1', title: 'Open machine', status: 'pending', dueDate: TODAY, dueTime: '09:00', checklistTemplateId: 'tpl-1', category: 'opening', priority: 'high' },
    { id: 'step-2', title: 'Fill blends', status: 'completed', dueDate: TODAY, checklistTemplateId: 'tpl-1', completedAt: '2026-10-26T08:00:00.000Z' },
    { id: 'plain', title: 'Call supplier', status: 'pending', dueDate: TODAY },
  ]

  const runs = [{
    id: 'run-1',
    templateId: 'tpl-1',
    dueDate: TODAY,
    title: 'BAR OPENING',
    steps: [
      { id: 'stored-1', runStepId: 'stored-1', sourceTaskId: 'step-1', title: 'Open machine', status: 'pending', orderIndex: 0 },
      { id: 'stored-2', runStepId: 'stored-2', sourceTaskId: 'step-2', title: 'Fill blends', status: 'completed', orderIndex: 1, completedAt: '2026-10-26T08:00:00.000Z' },
    ],
  }]

  it('keeps the current list when runs are not readable', () => {
    expect(mergeChecklistRunsIntoTasks(operationsTasks, null)).toBe(operationsTasks)
  })

  it('hides copied source tasks and keeps one run', () => {
    const merged = mergeChecklistRunsIntoTasks(operationsTasks, runs, [
      { id: 'tpl-1', name: 'BAR OPENING' },
    ])
    const collapsed = collapseChecklistRuns(merged, [{ id: 'tpl-1', name: 'BAR OPENING' }])

    expect(collapsed.map((task) => task.id)).toEqual([
      'plain',
      'checklist-run:tpl-1:2026-10-26',
    ])
    expect(collapsed[1]).toMatchObject({
      checklistRun: true,
      title: 'BAR OPENING',
      checklistStepCount: 2,
      checklistCompletedCount: 1,
      status: 'pending',
      dueTime: '09:00',
      category: 'opening',
    })
    expect(collapsed[1].checklistSteps.map((step) => step.runStepId)).toEqual(['stored-1', 'stored-2'])
  })

  it('attaches simple-task steps without hiding that task', () => {
    const merged = mergeChecklistRunsIntoTasks(
      [{ id: 'task-1', title: 'Close bar', status: 'pending', dueDate: TODAY }],
      [{
        id: 'run-2',
        operationsTaskId: 'task-1',
        templateId: null,
        dueDate: TODAY,
        title: 'Close bar',
        steps: [
          { id: 'a', runStepId: 'a', title: 'Wipe', status: 'completed', orderIndex: 0 },
          { id: 'b', runStepId: 'b', title: 'Lock', status: 'pending', orderIndex: 1 },
        ],
      }],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].checklistRun).toBeUndefined()
    expect(merged[0]).toMatchObject({
      id: 'task-1',
      checklistStepCount: 2,
      checklistCompletedCount: 1,
      status: 'pending',
    })
  })
})

describe('collapseChecklistRuns stored runs', () => {
  it('does not wrap a run that is already one task', () => {
    const collapsed = collapseChecklistRuns([
      {
        id: 'checklist-run:tpl-1:2026-10-26',
        title: 'BAR OPENING',
        status: 'pending',
        dueDate: TODAY,
        checklistRun: true,
        checklistTemplateId: 'tpl-1',
        checklistSteps: [{ id: 'stored-1', title: 'Open machine', status: 'pending' }],
        checklistStepCount: 1,
      },
    ], [{ id: 'tpl-1', name: 'BAR OPENING' }])

    expect(collapsed.map((task) => task.id)).toEqual(['checklist-run:tpl-1:2026-10-26'])
    expect(collapsed[0].checklistStepCount).toBe(1)
  })
})

describe('planDailyChecklistStart', () => {
  it('keeps one task per step when the run tables are not readable', () => {
    expect(planDailyChecklistStart({
      runs: null,
      legacyTasks: [],
      templateId: 'tpl-1',
      dueDate: TODAY,
    }).action).toBe('legacy-create')
  })

  it('does not create a second copy when the copied run already has steps', () => {
    expect(planDailyChecklistStart({
      runs: [{ id: 'run-1', templateId: 'tpl-1', dueDate: TODAY, steps: [{ id: 's1' }] }],
      legacyTasks: [{ id: 'old', checklistTemplateId: 'tpl-1', dueDate: TODAY }],
      templateId: 'tpl-1',
      dueDate: TODAY,
    }).action).toBe('run-exists')
  })

  it('keeps existing per-step tasks when no run has been stored yet', () => {
    expect(planDailyChecklistStart({
      runs: [],
      legacyTasks: [{ id: 'old', checklistTemplateId: 'tpl-1', dueDate: TODAY }],
      templateId: 'tpl-1',
      dueDate: TODAY,
    }).action).toBe('legacy-exists')
  })

  it('creates a run when neither a run nor per-step tasks exist', () => {
    expect(planDailyChecklistStart({
      runs: [],
      legacyTasks: [],
      templateId: 'tpl-1',
      dueDate: TODAY,
    })).toEqual({ action: 'create-run', fillRunId: null })
  })
})

describe('checklist run errors', () => {
  it('treats a locked or missing table as unreadable', () => {
    expect(isChecklistRunStorageUnavailable({ code: '42501', message: 'permission denied' })).toBe(true)
    expect(isChecklistRunStorageUnavailable({ code: 'PGRST205', message: 'schema cache' })).toBe(true)
    expect(isChecklistRunStorageUnavailable({ code: '42P01', message: 'does not exist' })).toBe(true)
  })

  it('treats the old not-null step shape as not ready', () => {
    expect(isChecklistRunShapeNotReady({ code: '23502', message: 'null value in column "source_task_id"' })).toBe(true)
    expect(isChecklistRunShapeNotReady({ code: '42703', message: 'column operations_task_id does not exist' })).toBe(true)
    expect(checklistRunFallbackError({ code: '23502', message: 'source_task_id' })).toBe(true)
    expect(checklistRunFallbackError({ code: '23505', message: 'duplicate key' })).toBe(false)
  })
})

describe('getChecklistTasksForTemplate', () => {
  it('opens the stored steps instead of the run row', () => {
    const steps = getChecklistTasksForTemplate([
      {
        id: 'checklist-run:tpl-1:2026-10-26',
        checklistRun: true,
        checklistTemplateId: 'tpl-1',
        dueDate: TODAY,
        checklistSteps: [
          { id: 'b', runStepId: 'b', title: 'Second', status: 'pending', orderIndex: 1 },
          { id: 'a', runStepId: 'a', title: 'First', status: 'pending', orderIndex: 0 },
        ],
      },
    ], 'tpl-1', TODAY)

    expect(steps.map((step) => step.runStepId)).toEqual(['a', 'b'])
  })
})
