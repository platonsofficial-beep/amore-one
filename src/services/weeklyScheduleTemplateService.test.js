import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import { createWeeklyScheduleTemplate } from './weeklyScheduleTemplateService'

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'
const EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333'
const SHIFT_TEMPLATE_ID = '44444444-4444-4444-8444-444444444444'

function query(result) {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

describe('createWeeklyScheduleTemplate', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('inserts the parent with workspace_id and does not ask PostgREST to return the row', async () => {
    const templateQuery = query({ error: null })
    const shiftQuery = query({ error: null })
    fromMock.mockImplementation((table) => (
      table === 'weekly_schedule_templates' ? templateQuery : shiftQuery
    ))

    const created = await createWeeklyScheduleTemplate({
      workspaceId: WORKSPACE_ID,
      name: '  Service week  ',
      shifts: [{
        dayIndex: 0,
        employeeId: '',
        shiftTemplateId: 'not-a-uuid',
        role: 'Server',
        area: 'Dining',
        startTime: '09:00',
        endTime: '17:00',
        status: 'Scheduled',
        notes: '',
      }],
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(created.name).toBe('Service week')
    expect(templateQuery.select).not.toHaveBeenCalled()
    expect(templateQuery.single).not.toHaveBeenCalled()
    expect(templateQuery.insert).toHaveBeenCalledWith([{
      id: created.id,
      name: 'Service week',
      workspace_id: WORKSPACE_ID,
    }])
    expect(shiftQuery.insert).toHaveBeenCalledWith([expect.objectContaining({
      template_id: created.id,
      day_index: 0,
      employee_id: null,
      role: 'Server',
      start_time: '09:00',
      end_time: '17:00',
    })])
    const shiftPayload = shiftQuery.insert.mock.calls[0][0][0]
    expect(shiftPayload.shift_template_id).toBeUndefined()
    expect(fromMock.mock.calls.map((call) => call[0])).toEqual([
      'weekly_schedule_templates',
      'weekly_schedule_template_shifts',
    ])
  })

  it('stores a shift template id when the reference is a uuid', async () => {
    const templateQuery = query({ error: null })
    const shiftQuery = query({ error: null })
    fromMock.mockImplementation((table) => (
      table === 'weekly_schedule_templates' ? templateQuery : shiftQuery
    ))

    await createWeeklyScheduleTemplate({
      workspaceId: WORKSPACE_ID,
      name: 'Dinner',
      shifts: [{
        dayIndex: 2,
        employeeId: EMPLOYEE_ID,
        shiftTemplateId: SHIFT_TEMPLATE_ID,
        startTime: '18:00',
        endTime: '23:00',
      }],
    })

    expect(shiftQuery.insert).toHaveBeenCalledWith([expect.objectContaining({
      employee_id: EMPLOYEE_ID,
      shift_template_id: SHIFT_TEMPLATE_ID,
      day_index: 2,
    })])
    expect(templateQuery.select).not.toHaveBeenCalled()
  })

  it('does not insert shifts when the template insert is rejected by row level security', async () => {
    const templateQuery = query({
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "weekly_schedule_templates"',
      },
    })
    fromMock.mockImplementation(() => templateQuery)

    await expect(createWeeklyScheduleTemplate({
      workspaceId: WORKSPACE_ID,
      name: 'Blocked',
      shifts: [{ dayIndex: 0, employeeId: EMPLOYEE_ID, startTime: '09:00', endTime: '17:00' }],
    })).rejects.toThrow(/row-level security policy/)

    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(templateQuery.select).not.toHaveBeenCalled()
  })

  it('requires a workspace before inserting', async () => {
    await expect(createWeeklyScheduleTemplate({
      workspaceId: '   ',
      name: 'Week',
      shifts: [],
    })).rejects.toThrow(/Workspace is required/)
    expect(fromMock).not.toHaveBeenCalled()
  })
})
