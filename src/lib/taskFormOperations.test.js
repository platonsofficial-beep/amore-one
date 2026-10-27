import { describe, expect, it } from 'vitest'
import { buildTaskForm } from './taskFormUtils'
import {
  mapTaskFormToOperationsTask,
  presentOperationsTaskForTaskBoard,
} from './taskFormOperations'

describe('mapTaskFormToOperationsTask', () => {
  it('maps the Tasks form onto an operations task', () => {
    expect(mapTaskFormToOperationsTask({
      title: '  Check the fridge  ',
      department: 'bar',
      departmentCustom: '',
      assignedEmployeeId: 'emp-7',
      priority: 'important',
      dueDate: '2026-10-27',
      dueTime: '18:00',
      recurrence: 'weekly',
      notes: '  Log the temperature  ',
    })).toEqual({
      title: 'Check the fridge',
      description: 'Log the temperature',
      category: 'bar',
      priority: 'high',
      assignedTo: 'emp-7',
      dueDate: '2026-10-27',
      dueTime: '18:00',
      repeatRule: 'weekly',
    })
  })

  it('stores departments outside the operations list as other and clears an empty owner', () => {
    expect(mapTaskFormToOperationsTask({
      title: 'Receive delivery',
      department: 'logistics',
      assignedEmployeeId: '',
      priority: 'urgent',
      dueDate: '2026-10-28',
      dueTime: null,
      recurrence: 'none',
      notes: '',
    })).toMatchObject({
      category: 'other',
      priority: 'urgent',
      assignedTo: null,
      description: '',
      repeatRule: '',
      dueDate: '2026-10-28',
    })

    expect(mapTaskFormToOperationsTask({
      title: 'Custom board',
      department: 'custom',
      departmentCustom: 'Events',
      priority: 'normal',
      dueDate: '2026-10-28',
    }).category).toBe('other')
  })

  it('keeps an existing operations category when the board label is only a display department', () => {
    const presented = presentOperationsTaskForTaskBoard({
      id: 'task-1',
      title: 'Check walk-in',
      description: 'Morning temps',
      category: 'kitchen',
      priority: 'high',
      status: 'pending',
      assignedTo: 'emp-1',
      dueDate: '2026-10-27',
      dueTime: '09:00',
      repeatRule: '',
    })

    expect(presented).toMatchObject({
      taskSource: 'operations',
      department: 'kitchen',
      departmentCustom: '',
      assignedEmployeeId: 'emp-1',
      notes: 'Morning temps',
      priority: 'important',
      category: 'kitchen',
    })

    const form = buildTaskForm(presented)
    expect(mapTaskFormToOperationsTask({
      ...form,
      assignedEmployeeId: form.assignedEmployeeId || null,
    })).toMatchObject({
      title: 'Check walk-in',
      description: 'Morning temps',
      category: 'kitchen',
      priority: 'high',
      assignedTo: 'emp-1',
      dueDate: '2026-10-27',
      dueTime: '09:00',
      repeatRule: '',
    })
  })

  it('leaves checklist rows off the department boards', () => {
    expect(presentOperationsTaskForTaskBoard({
      id: 'step-1',
      title: 'Open the bar',
      checklistTemplateId: 'template-1',
      category: 'bar',
      status: 'pending',
    })).toBeNull()
    expect(presentOperationsTaskForTaskBoard({
      id: 'checklist-run:template-1:2026-10-27',
      checklistRun: true,
      category: 'opening',
      status: 'pending',
    })).toBeNull()
  })
})
