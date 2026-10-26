import { describe, expect, it } from 'vitest'
import { calculateTaskOverview } from './taskUtils'
import {
  buildSharedTaskWindow,
  buildUnifiedOperationalTaskCounts,
  collapseChecklistRuns,
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

    const combined = combineOperationalTasks(workspaceTasks, operationsTasks, TODAY, [], [
      { id: 'tpl-1', name: 'BAR OPENING' },
    ])
    const overview = calculateTaskOverview(combined, TODAY)
    const window = buildSharedTaskWindow(combined, TODAY)

    expect(combined.map((task) => task.id)).toEqual([
      3,
      6,
      7,
      2,
      'done-op',
      'checklist-run:tpl-1:2026-07-07',
      'checklist-run:tpl-1:2026-10-26',
    ])
    expect(combined.find((task) => task.id === 'checklist-run:tpl-1:2026-07-07')).toMatchObject({
      title: 'BAR OPENING',
      checklistRun: true,
      checklistStepCount: 3,
      checklistCompletedCount: 0,
      status: 'pending',
    })
    expect(overview.active).toBe(5)
    expect(overview.overdue).toBe(4)
    expect(window.openCount).toBe(5)
    expect(window.pastDueCount).toBe(4)
    expect(window.listTasks.map((task) => task.id)).toEqual([
      3,
      6,
      'checklist-run:tpl-1:2026-07-07',
      7,
      'checklist-run:tpl-1:2026-10-26',
    ])
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

  it('keeps future-due open tasks in the list so the list matches the open count', () => {
    const window = buildSharedTaskWindow([
      { id: 'later', title: 'Next week', status: 'pending', dueDate: '2026-11-02' },
      { id: 'today', title: 'Today', status: 'active', dueDate: TODAY },
    ], TODAY)

    expect(window.openCount).toBe(2)
    expect(window.listTasks.map((task) => task.id)).toEqual(['today', 'later'])
  })
})

describe('buildUnifiedOperationalTaskCounts', () => {
  it('splits board and operations open counts that add up to one open total', () => {
    const counts = buildUnifiedOperationalTaskCounts({
      boardTasks: [
        { id: 'board-late', status: 'active', dueDate: '2026-10-20' },
        { id: 'board-later', status: 'active', dueDate: '2026-11-02' },
        { id: 'board-skipped', status: 'skipped', dueDate: '2026-10-01' },
      ],
      operationsTasks: [
        { id: 'ops-late', status: 'pending', dueDate: '2026-10-20' },
        { id: 'ops-today-check', status: 'pending', dueDate: TODAY, checklistTemplateId: 'tpl' },
      ],
      checklistTemplates: [{ id: 'tpl', name: 'BAR OPENING' }],
      todayKey: TODAY,
    })

    expect(counts.boardOpen).toBe(2)
    expect(counts.opsOpen).toBe(2)
    expect(counts.openCount).toBe(counts.boardOpen + counts.opsOpen)
    expect(counts.pastDueCount).toBe(2)
    expect(counts.boardPastDue).toBe(1)
    expect(counts.listTasks.map((task) => task.id)).toEqual([
      'board-late',
      'ops-late',
      'checklist-run:tpl:2026-10-26',
      'board-later',
    ])
    expect(counts.listTasks.find((task) => task.checklistRun)?.title).toBe('BAR OPENING')
  })
})

describe('collapseChecklistRuns', () => {
  it('keeps a finished run as one completed task and drops an all-skipped run', () => {
    const collapsed = collapseChecklistRuns([
      {
        id: 'a',
        title: 'Open',
        status: 'completed',
        dueDate: TODAY,
        checklistTemplateId: 'tpl',
        checklistOrderIndex: 0,
        completedAt: '2026-10-26T08:00:00.000Z',
      },
      {
        id: 'b',
        title: 'Close',
        status: 'completed',
        dueDate: TODAY,
        checklistTemplateId: 'tpl',
        checklistOrderIndex: 1,
        completedAt: '2026-10-26T09:00:00.000Z',
      },
      {
        id: 'skip',
        title: 'Skip',
        status: 'skipped',
        dueDate: '2026-10-20',
        checklistTemplateId: 'other',
      },
      { id: 'plain', title: 'Call supplier', status: 'pending', dueDate: TODAY },
    ], [{ id: 'tpl', name: 'BAR OPENING' }])

    expect(collapsed.map((task) => task.id)).toEqual([
      'plain',
      'checklist-run:tpl:2026-10-26',
    ])
    expect(collapsed[1]).toMatchObject({
      title: 'BAR OPENING',
      status: 'completed',
      checklistStepCount: 2,
      checklistCompletedCount: 2,
      completedAt: '2026-10-26T09:00:00.000Z',
    })
  })
})
