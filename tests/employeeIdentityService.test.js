// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDENTITY_COLOR_PALETTE } from '../src/lib/identity/identityColorPalette'

const supabaseMocks = vi.hoisted(() => {
  let queryResult = { data: [], error: null }
  let rpcResult = { data: null, error: null }

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      return Promise.resolve(queryResult).then(onFulfilled, onRejected)
    },
  }

  return {
    builder,
    setQueryResult(result) {
      queryResult = result
    },
    setRpcResult(result) {
      rpcResult = result
    },
    reset() {
      queryResult = { data: [], error: null }
      rpcResult = { data: null, error: null }
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      builder.not.mockImplementation(() => builder)
      builder.order.mockImplementation(() => builder)
    },
    rpc: vi.fn(async () => rpcResult),
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => supabaseMocks.builder),
    rpc: supabaseMocks.rpc,
  },
}))

import {
  EMPLOYEE_IDENTITY_ASSIGNMENT_RPC,
  EMPLOYEE_IDENTITY_PALETTE_SIZE,
  assignEmployeeIdentityColor,
  getAvailableIdentityColorsForWorkspace,
  getFriendlyEmployeeIdentityError,
  getWorkspaceIdentityColorAssignments,
} from '../src/services/employeeIdentityService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const EMPLOYEE_ID = 'emp-22222222-2222-2222-2222-222222222222'
const OTHER_EMPLOYEE_ID = 'emp-33333333-3333-3333-3333-333333333333'

function resetMocks() {
  supabaseMocks.reset()
}

describe('employeeIdentityService', () => {
  beforeEach(() => {
    resetMocks()
  })

  describe('getFriendlyEmployeeIdentityError', () => {
    it('maps unique violations to a color-taken message', () => {
      expect(getFriendlyEmployeeIdentityError({ code: '23505' }))
        .toBe('This color is already being used by another employee.')
      expect(getFriendlyEmployeeIdentityError({ message: 'employee_identity_color_taken' }))
        .toBe('This color is already being used by another employee.')
    })

    it('maps invalid color, forbidden, not found, and migration errors', () => {
      expect(getFriendlyEmployeeIdentityError({ message: 'employee_identity_invalid_color' }))
        .toBe('This color is not available in the ONE identity palette.')
      expect(getFriendlyEmployeeIdentityError({ message: 'employee_identity_forbidden' }))
        .toBe('You do not have permission to change this employee\'s identity color.')
      expect(getFriendlyEmployeeIdentityError({ message: 'employee_identity_employee_not_found' }))
        .toBe('This employee could not be found in the current workspace.')
      expect(getFriendlyEmployeeIdentityError({ message: 'could not find the function assign_employee_identity_color' }))
        .toBe('Employee identity is not ready yet. Apply the required database migration.')
      expect(getFriendlyEmployeeIdentityError({ message: 'Something unexpected happened' }))
        .toBe('Unable to update the employee color. Please try again.')
    })
  })

  describe('getWorkspaceIdentityColorAssignments', () => {
    it('requires a workspace ID', async () => {
      await expect(getWorkspaceIdentityColorAssignments('')).rejects.toThrow('Workspace is required')
    })

    it('returns normalized assignment rows ordered by query', async () => {
      supabaseMocks.setQueryResult({
        data: [
          { id: EMPLOYEE_ID, full_name: 'Alex Morgan', identity_color: 'emerald' },
        ],
        error: null,
      })

      const assignments = await getWorkspaceIdentityColorAssignments(WORKSPACE_ID)

      expect(assignments).toEqual([
        {
          employeeId: EMPLOYEE_ID,
          employeeName: 'Alex Morgan',
          colorId: 'emerald',
        },
      ])
      expect(supabaseMocks.builder.select).toHaveBeenCalledWith('id, full_name, identity_color')
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
      expect(supabaseMocks.builder.not).toHaveBeenCalledWith('identity_color', 'is', null)
      expect(supabaseMocks.builder.order).toHaveBeenCalledWith('full_name', { ascending: true })
    })

    it('returns an empty array when no colors are assigned', async () => {
      supabaseMocks.setQueryResult({ data: [], error: null })
      await expect(getWorkspaceIdentityColorAssignments(WORKSPACE_ID)).resolves.toEqual([])
    })
  })

  describe('getAvailableIdentityColorsForWorkspace', () => {
    it('returns all 48 colors when the workspace has no assignments', async () => {
      supabaseMocks.setQueryResult({ data: [], error: null })

      const result = await getAvailableIdentityColorsForWorkspace({ workspaceId: WORKSPACE_ID })

      expect(result.assignments).toEqual([])
      expect(result.availableColors).toHaveLength(48)
      expect(result.availableColors[0]).toEqual(IDENTITY_COLOR_PALETTE[0])
      expect(result.availableColors).not.toBe(IDENTITY_COLOR_PALETTE)
    })

    it('excludes occupied colors and preserves the current employee exception', async () => {
      supabaseMocks.setQueryResult({
        data: [
          { id: EMPLOYEE_ID, full_name: 'Alex Morgan', identity_color: 'emerald' },
          { id: OTHER_EMPLOYEE_ID, full_name: 'Jamie Lee', identity_color: 'ocean' },
        ],
        error: null,
      })

      const result = await getAvailableIdentityColorsForWorkspace({
        workspaceId: WORKSPACE_ID,
        exceptEmployeeId: EMPLOYEE_ID,
      })

      expect(result.availableColors.some((color) => color.id === 'emerald')).toBe(true)
      expect(result.availableColors.some((color) => color.id === 'ocean')).toBe(false)
      expect(result.availableColors).toHaveLength(47)
    })
  })

  describe('assignEmployeeIdentityColor', () => {
    it('requires workspace and employee IDs', async () => {
      await expect(assignEmployeeIdentityColor({
        workspaceId: '',
        employeeId: EMPLOYEE_ID,
        colorId: 'emerald',
      })).rejects.toThrow('Workspace is required')

      await expect(assignEmployeeIdentityColor({
        workspaceId: WORKSPACE_ID,
        employeeId: '',
        colorId: 'emerald',
      })).rejects.toThrow('Employee is required')
    })

    it('accepts null to clear a color', async () => {
      supabaseMocks.rpc.mockResolvedValueOnce({
        data: [{
          employee_id: EMPLOYEE_ID,
          workspace_id: WORKSPACE_ID,
          identity_color: null,
        }],
        error: null,
      })

      const result = await assignEmployeeIdentityColor({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        colorId: null,
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith(EMPLOYEE_IDENTITY_ASSIGNMENT_RPC, {
        p_workspace_id: WORKSPACE_ID,
        p_employee_id: EMPLOYEE_ID,
        p_color_id: null,
      })
      expect(result).toEqual({
        employeeId: EMPLOYEE_ID,
        workspaceId: WORKSPACE_ID,
        identityColor: null,
      })
    })

    it('accepts valid palette IDs and maps RPC results to camelCase', async () => {
      supabaseMocks.rpc.mockResolvedValueOnce({
        data: [{
          employee_id: EMPLOYEE_ID,
          workspace_id: WORKSPACE_ID,
          identity_color: 'rose-gold',
        }],
        error: null,
      })

      const result = await assignEmployeeIdentityColor({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        colorId: 'rose-gold',
      })

      expect(result.identityColor).toBe('rose-gold')
    })

    it('rejects invalid, neutral, uppercase, and whitespace-only colors before RPC', async () => {
      supabaseMocks.rpc.mockClear()

      const invalidCases = ['neutral', 'Emerald', '  emerald  ', '   ', '#ff0000', 'unknown']

      for (const colorId of invalidCases) {
        await expect(assignEmployeeIdentityColor({
          workspaceId: WORKSPACE_ID,
          employeeId: EMPLOYEE_ID,
          colorId,
        })).rejects.toThrow('This color is not available in the ONE identity palette.')
      }

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('maps RPC authorization and conflict errors to friendly messages', async () => {
      supabaseMocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'employee_identity_forbidden' },
      })

      await expect(assignEmployeeIdentityColor({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        colorId: 'emerald',
      })).rejects.toThrow('You do not have permission')

      supabaseMocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })

      await expect(assignEmployeeIdentityColor({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        colorId: 'emerald',
      })).rejects.toThrow('already being used')
    })

    it('handles empty RPC results safely', async () => {
      supabaseMocks.rpc.mockResolvedValueOnce({ data: [], error: null })

      await expect(assignEmployeeIdentityColor({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        colorId: 'emerald',
      })).rejects.toThrow('Unable to update the employee color')
    })
  })

  it('exposes the locked palette size for future UI consumers', () => {
    expect(EMPLOYEE_IDENTITY_PALETTE_SIZE).toBe(48)
  })
})

describe('employees_identity_rpc.sql source review', () => {
  const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '../supabase/employees_identity_rpc.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  it('defines a SECURITY DEFINER RPC with explicit search_path and auth checks', () => {
    expect(sql).toContain('create or replace function public.assign_employee_identity_color')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('can_manage_workspace_stock')
    expect(sql).toContain('workspace_members')
  })

  it('validates all 48 palette IDs and excludes neutral from persistence', () => {
    expect(sql).toContain("'dusk'")
    expect(sql).toContain("'champagne'")
    expect(sql).toContain("if p_color_id = 'neutral' then")

    const allowedArrayMatch = sql.match(/v_allowed_color_ids constant text\[\] := array\[([\s\S]*?)\];/)
    expect(allowedArrayMatch).not.toBeNull()
    expect(allowedArrayMatch[1]).not.toContain("'neutral'")
    expect(allowedArrayMatch[1].match(/'[^']+'/g)).toHaveLength(48)
    expect(sql).toContain('employee_identity_invalid_color')
  })

  it('returns only identity fields and grants execute to authenticated only', () => {
    expect(sql).toContain('returns table (')
    expect(sql).toContain('employee_id uuid')
    expect(sql).toContain('identity_color text')
    expect(sql).toContain('grant execute on function public.assign_employee_identity_color(uuid, uuid, text) to authenticated')
    expect(sql).not.toMatch(/grant execute[\s\S]*to anon/)
  })
})
