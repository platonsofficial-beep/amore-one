// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let queryResult = { data: [], error: null }
  let updatePayload = null
  const rpc = vi.fn(async () => ({ data: [], error: null }))

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    update: vi.fn((payload) => {
      updatePayload = payload
      return builder
    }),
    delete: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      return Promise.resolve(queryResult).then(onFulfilled, onRejected)
    },
  }

  return {
    builder,
    rpc,
    getUpdatePayload() {
      return updatePayload
    },
    setQueryResult(result) {
      queryResult = result
    },
    reset() {
      rpc.mockReset().mockResolvedValue({ data: [], error: null })
      queryResult = { data: [], error: null }
      updatePayload = null
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      builder.order.mockImplementation(() => builder)
      builder.update.mockImplementation((payload) => {
        updatePayload = payload
        return builder
      })
      builder.delete.mockImplementation(() => builder)
      builder.insert.mockImplementation(() => builder)
      builder.single.mockImplementation(() => builder)
      builder.maybeSingle.mockImplementation(() => builder)
    },
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => supabaseMocks.builder),
    rpc: supabaseMocks.rpc,
  },
}))

vi.mock('../src/services/positionsService', () => ({
  getPositions: vi.fn(async () => []),
  ensurePositionByName: vi.fn(async () => ({ id: 1, name: 'Server', department: 'Service' })),
}))

import { getEmployees, updateEmployee } from '../src/services/staffService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const EMPLOYEE_ID = 'emp-22222222-2222-2222-2222-222222222222'

function buildEmployeeRow(overrides = {}) {
  return {
    id: EMPLOYEE_ID,
    workspace_id: WORKSPACE_ID,
    full_name: 'Alex Morgan',
    position: 'Server',
    primary_position: 'Server',
    additional_positions: [],
    phone: '+35700000000',
    email: 'alex@example.com',
    hire_date: '2024-01-01',
    salary: null,
    emergency_contact: 'Not provided',
    weekly_hours: null,
    notes: 'No notes yet.',
    shift: 'Evening',
    status: 'Working',
    department: 'Service',
    identity_color: null,
    employee_positions: [],
    ...overrides,
  }
}

describe('staffService identity mapping', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('maps identity_color to identityColor and preserves null', async () => {
    supabaseMocks.setQueryResult({
      data: [
        buildEmployeeRow({ identity_color: 'emerald' }),
        buildEmployeeRow({ id: 'emp-2', full_name: 'Jamie Lee', identity_color: null }),
      ],
      error: null,
    })

    const employees = await getEmployees(WORKSPACE_ID)

    expect(employees[0].identityColor).toBe('emerald')
    expect(employees[1].identityColor).toBeNull()
    expect(employees[0].name).toBe('Alex Morgan')
  })

  it('does not include identity_color in unrelated employee updates', async () => {
    supabaseMocks.setQueryResult({
      data: buildEmployeeRow({ identity_color: 'emerald' }),
      error: null,
    })

    await updateEmployee(WORKSPACE_ID, EMPLOYEE_ID, {
      name: 'Alex Morgan',
      position: 'Server',
      positions: [{ id: null, name: 'Server', department: 'Service' }],
      primaryPosition: 'Server',
      additionalPositions: [],
      phone: '+35700000000',
      email: 'alex@example.com',
      hireDate: '2024-01-01',
      salary: '',
      emergencyContact: 'Not provided',
      weeklyHours: '',
      notes: 'No notes yet.',
      shift: 'Evening',
      status: 'Working',
      department: 'Service',
    })

    expect(supabaseMocks.getUpdatePayload()).not.toHaveProperty('identity_color')
  })

  it('preserves identity_color when identityColor is explicitly present', async () => {
    supabaseMocks.setQueryResult({
      data: buildEmployeeRow({ identity_color: 'ocean' }),
      error: null,
    })

    await updateEmployee(WORKSPACE_ID, EMPLOYEE_ID, {
      name: 'Alex Morgan',
      position: 'Server',
      positions: [{ id: null, name: 'Server', department: 'Service' }],
      primaryPosition: 'Server',
      additionalPositions: [],
      phone: '+35700000000',
      email: 'alex@example.com',
      hireDate: '2024-01-01',
      salary: '',
      emergencyContact: 'Not provided',
      weeklyHours: '',
      notes: 'No notes yet.',
      shift: 'Evening',
      status: 'Working',
      department: 'Service',
      identityColor: 'ocean',
    })

    expect(supabaseMocks.getUpdatePayload()?.identity_color).toBe('ocean')
  })

  it('rejects invalid identityColor values during serialization', async () => {
    await expect(updateEmployee(WORKSPACE_ID, EMPLOYEE_ID, {
      name: 'Alex Morgan',
      position: 'Server',
      positions: [],
      primaryPosition: 'Server',
      additionalPositions: [],
      phone: '',
      email: '',
      hireDate: '',
      salary: '',
      emergencyContact: '',
      weeklyHours: '',
      notes: '',
      shift: 'Evening',
      status: 'Working',
      department: 'Service',
      identityColor: 'neutral',
    })).rejects.toThrow('Invalid employee identity color.')
  })
})


describe('staffService private fields', () => {
  beforeEach(() => supabaseMocks.reset())

  it('uses authorized private fields and never a legacy unrestricted salary', async () => {
    supabaseMocks.setQueryResult({ data: [buildEmployeeRow({ salary: 42000 })], error: null })
    const [employee] = await getEmployees(WORKSPACE_ID)
    expect(employee.salary).toBe('')
    expect(employee.notes).toBe('')
    expect(employee.emergencyContact).toBe('')
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('get_employee_private_fields', {
      p_workspace_id: WORKSPACE_ID, p_employee_ids: [EMPLOYEE_ID],
    })
    expect(supabaseMocks.builder.select.mock.calls[0][0]).not.toContain('*')
    expect(supabaseMocks.builder.select.mock.calls[0][0]).not.toMatch(/salary|emergency_contact|notes/)
  })

  it('hydrates authorized salary and manager details', async () => {
    supabaseMocks.setQueryResult({ data: [buildEmployeeRow()], error: null })
    supabaseMocks.rpc.mockResolvedValue({ data: [{ id: EMPLOYEE_ID, salary: 42000,
      emergency_contact: 'Contact', notes: 'Private note' }], error: null })
    const [employee] = await getEmployees(WORKSPACE_ID)
    expect(employee).toMatchObject({ salary: 42000, emergencyContact: 'Contact', notes: 'Private note' })
  })

  it('fails closed if the private-fields RPC is unavailable', async () => {
    supabaseMocks.setQueryResult({ data: [buildEmployeeRow({ salary: 42000 })], error: null })
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } })
    await expect(getEmployees(WORKSPACE_ID)).rejects.toThrow('RPC unavailable')
  })

  it('omits an unauthorized salary instead of overwriting the stored value', async () => {
    supabaseMocks.setQueryResult({ data: buildEmployeeRow(), error: null })
    await updateEmployee(WORKSPACE_ID, EMPLOYEE_ID, { name: 'Alex Morgan', salary: undefined })
    expect(supabaseMocks.getUpdatePayload()).not.toHaveProperty('salary')
  })
})
