// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let queryResult = { data: [], error: null }
  let rpcResult = { data: true, error: null }

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
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
      rpcResult = { data: true, error: null }
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      this.from.mockClear()
      this.rpc.mockClear()
      this.rpc.mockImplementation(async () => rpcResult)
      this.from.mockImplementation(() => builder)
    },
    from: vi.fn(() => builder),
    rpc: vi.fn(async () => rpcResult),
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => supabaseMocks.from(...args),
    rpc: (...args) => supabaseMocks.rpc(...args),
  },
}))

import { getInventoryMigrationMetrics } from '../src/services/inventoryMigrationMetricsService'
import { canManageStock } from '../src/lib/permissions'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'

describe('inventory_stock_item_map_rls_policies.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_stock_item_map_rls_policies.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  it('uses Stock RLS helpers and manager-only SELECT', () => {
    expect(sql).toContain('can_manage_workspace_stock')
    expect(sql).toContain("wm.role in ('owner', 'general_manager', 'manager')")
    expect(sql).toContain('inventory_stock_item_map_select_managers')
    expect(sql).toContain('for select')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('using (public.can_manage_workspace_stock(workspace_id))')
  })

  it('does not grant client write policies or anon access', () => {
    expect(sql).toContain('grant select on table public.inventory_stock_item_map to authenticated')
    expect(sql).toContain('revoke all on table public.inventory_stock_item_map from anon')
    expect(sql).toContain('Intentionally no INSERT / UPDATE / DELETE policies')
    expect(sql).not.toMatch(/create policy[\s\S]*for insert/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for delete/i)
    expect(sql.toLowerCase()).not.toContain('to anon')
  })

  it('documents denied roles including host and staff', () => {
    expect(sql).toContain('host')
    expect(sql).toContain('staff')
    expect(sql).toContain('anonymous')
  })
})

describe('inventory migration read authorization (app roles)', () => {
  it.each(['owner', 'general_manager', 'manager'])('allows %s via canManageStock', (role) => {
    expect(canManageStock(role)).toBe(true)
  })

  it.each(['host', 'staff', null, undefined, ''])('denies %s via canManageStock', (role) => {
    expect(canManageStock(role)).toBe(false)
  })
})

describe('getInventoryMigrationMetrics authorization', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('loads metrics when can_manage_workspace_stock returns true', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({
      data: [
        {
          id: 'row-1',
          status: 'linked',
          resolution_type: 'auto_link',
          migrated_at: '2026-07-16T10:00:00.000Z',
          legacy_inventory_item_id: 1,
          stock_item_id: 'stock-1',
          source_snapshot: { item_name: 'Gin' },
          conflict_reason: '',
          created_at: '2026-07-16T09:00:00.000Z',
        },
      ],
      error: null,
    })

    const result = await getInventoryMigrationMetrics(WORKSPACE_ID)

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('can_manage_workspace_stock', {
      target_workspace_id: WORKSPACE_ID,
    })
    expect(supabaseMocks.from).toHaveBeenCalledWith('inventory_stock_item_map')
    expect(result.metricsAvailable).toBe(true)
    expect(result.error).toBeNull()
    expect(result.metrics.completed).toBe(1)
  })

  it('denies host/staff/wrong-workspace style false authorization without fabricating metrics', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationMetrics(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.metricsAvailable).toBe(false)
    expect(result.tableReachable).toBe(false)
    expect(result.metrics.total).toBe(0)
    expect(result.manualReviewRows).toEqual([])
    expect(result.attentionRows).toEqual([])
    expect(result.error).toMatch(/permission/i)
  })

  it('denies when authorization RPC fails', async () => {
    supabaseMocks.setRpcResult({ data: null, error: { message: 'rpc failed' } })

    const result = await getInventoryMigrationMetrics(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.metricsAvailable).toBe(false)
    expect(result.error).toMatch(/rpc failed|Unable to verify/i)
  })

  it('does not query the map for empty workspace id', async () => {
    const result = await getInventoryMigrationMetrics('  ')

    expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.metricsAvailable).toBe(false)
    expect(result.error).toBeNull()
  })
})
