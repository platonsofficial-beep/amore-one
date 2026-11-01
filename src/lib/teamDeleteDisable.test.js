import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

const { formatEmployeeDeleteError, isEmployeeDisabled } = await import('../services/staffService')
const { buildPeopleDepartmentFilters, employeeMatchesPeopleFilter } = await import('../components/team/TeamPeopleView')

describe('team delete / disable', () => {
  it('explains the leave-request block instead of failing silently', () => {
    const message = formatEmployeeDeleteError({
      code: '23503',
      message: 'update or delete on table "employees" violates foreign key constraint "leave_requests_employee_id_fkey" on table "leave_requests"',
    })
    expect(message).toMatch(/leave requests/)
    expect(message).toMatch(/Disable/)
  })

  it('treats status Disabled or active=false as disabled', () => {
    expect(isEmployeeDisabled({ status: 'Disabled' })).toBe(true)
    expect(isEmployeeDisabled({ active: false, status: 'Working' })).toBe(true)
    expect(isEmployeeDisabled({ active: true, status: 'Working' })).toBe(false)
  })

  it('shows disabled people only under the Disabled chip', () => {
    const people = [
      { id: '1', department: 'Bar', status: 'Working', active: true },
      { id: '2', department: 'Bar', status: 'Disabled', active: false },
    ]
    expect(buildPeopleDepartmentFilters(people)).toEqual(['All', 'Bar', 'Disabled'])
    expect(people.filter((p) => employeeMatchesPeopleFilter(p, 'All')).map((p) => p.id)).toEqual(['1'])
    expect(people.filter((p) => employeeMatchesPeopleFilter(p, 'Disabled')).map((p) => p.id)).toEqual(['2'])
  })
})
