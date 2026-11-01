import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ rpc: null, del: null }))

vi.mock('../lib/supabaseClient', () => {
  const chain = {
    delete: () => chain,
    update: () => chain,
    eq: () => chain,
    select: async () => state.del,
  }
  return { supabase: { rpc: async () => state.rpc, from: () => chain } }
})

const { deleteEmployee, setEmployeeEnabled } = await import('./staffService')

describe('deleteEmployee', () => {
  beforeEach(() => {
    state.rpc = { data: null, error: { code: 'PGRST202', message: 'function not found' } }
  })

  it('uses the server function when it exists', async () => {
    state.rpc = { data: { removed: true }, error: null }
    await expect(deleteEmployee('ws-1', 'e-1')).resolves.toEqual({ removed: true })
  })

  it('surfaces the foreign key error from the fallback delete', async () => {
    state.del = { data: null, error: { code: '23503', message: 'violates foreign key constraint "leave_requests_employee_id_fkey"' } }
    await expect(deleteEmployee('ws-1', 'e-1')).rejects.toThrow(/leave requests/)
  })

  it('never reports success when nothing was deleted', async () => {
    state.del = { data: [], error: null }
    await expect(deleteEmployee('ws-1', 'e-1')).rejects.toThrow(/Nothing was deleted/)
  })

  it('falls back to marking the employee disabled', async () => {
    state.del = { data: [{ id: 'e-1' }], error: null }
    await expect(setEmployeeEnabled('ws-1', 'e-1', false)).resolves.toEqual({ enabled: false, serverEnforced: false })
  })
})
