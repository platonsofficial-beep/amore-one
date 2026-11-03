import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ inserts: [] }))

vi.mock('./positionsService', () => ({
  getPositions: async () => [{ id: 8, name: 'Bartender', department: 'Bar' }],
  ensurePositionByName: async (_ws, name, department) => ({ id: 42, name, department }),
}))

vi.mock('../lib/supabaseClient', () => {
  const make = (table) => {
    const chain = {
      insert: (rows) => { calls.inserts.push({ table, rows }); return chain },
      select: () => chain,
      single: async () => ({ data: { id: 'emp-1' }, error: null }),
      delete: () => chain,
      eq: () => chain,
      then: (resolve) => resolve({ data: null, error: null }),
    }
    return chain
  }
  return { supabase: { from: (table) => make(table) } }
})

const { createEmployee, toPositionId, toDateOrNull } = await import('./staffService')

describe('add employee', () => {
  it('never turns a missing position id into 0', () => {
    expect(toPositionId(null)).toBeNull()
    expect(toPositionId('')).toBeNull()
    expect(toPositionId(undefined)).toBeNull()
    expect(toPositionId(0)).toBeNull()
    expect(toPositionId('8')).toBe(8)
  })

  it('sends null for an empty start date', () => {
    expect(toDateOrNull('')).toBeNull()
    expect(toDateOrNull('2026-11-03')).toBe('2026-11-03')
  })

  it('creates the workspace position for a catalog role with no id', async () => {
    calls.inserts = []
    await createEmployee('ws-1', {
      name: 'TEST Manager',
      hireDate: '',
      positions: [{ id: null, name: 'Operations Manager', department: 'Management' }],
      primaryPosition: 'Operations Manager',
    })
    const employeeInsert = calls.inserts.find((c) => c.table === 'employees')
    expect(employeeInsert.rows[0].hire_date).toBeNull()
    const link = calls.inserts.find((c) => c.table === 'employee_positions')
    expect(link.rows).toEqual([{ employee_id: 'emp-1', position_id: 42 }])
  })
})
