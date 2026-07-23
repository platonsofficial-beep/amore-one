/**
 * @vitest-environment node
 * P8.16.34 — Zero-current inventory count repair RPC + ops service.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPAIR_SQL = readFileSync(
  join(HERE, '../supabase/inventory_count_repair_current_location_rpc.sql'),
  'utf8',
)
const CREATE_SQL = readFileSync(
  join(HERE, '../supabase/inventory_count_create_session_rpc.sql'),
  'utf8',
)
const SERVICE_SOURCE = readFileSync(
  join(HERE, '../src/services/inventoryCountService.js'),
  'utf8',
)
const APP_SOURCE = readFileSync(join(HERE, '../src/App.jsx'), 'utf8')
const WORKSPACE_SOURCE = readFileSync(
  join(HERE, '../src/components/stock/InventoryCountSessionWorkspace.jsx'),
  'utf8',
)

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: vi.fn(),
  },
}))

vi.mock('../src/services/membershipService', () => ({
  getMemberDisplayNamesByAuthUserIds: vi.fn(async () => ({})),
}))

import { repairInventoryCountCurrentLocation } from '../src/services/inventoryCountService.js'

const FUNCTION_BODY = REPAIR_SQL.slice(
  REPAIR_SQL.indexOf('create or replace function public.repair_inventory_count_current_location'),
  REPAIR_SQL.indexOf('comment on function public.repair_inventory_count_current_location'),
)

describe('repair_inventory_count_current_location SQL contract (P8.16.34)', () => {
  it('defines SECURITY DEFINER RPC with manager authorization', () => {
    expect(REPAIR_SQL).toContain('create or replace function public.repair_inventory_count_current_location(')
    expect(REPAIR_SQL).toContain('p_workspace_id uuid')
    expect(REPAIR_SQL).toContain('p_session_id uuid')
    expect(REPAIR_SQL).toContain('p_preview boolean default true')
    expect(REPAIR_SQL).toContain('returns jsonb')
    expect(REPAIR_SQL).toMatch(/security definer/i)
    expect(REPAIR_SQL).toContain('set search_path = public')
    expect(FUNCTION_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(FUNCTION_BODY).toContain('inventory_count_repair_forbidden')
    expect(FUNCTION_BODY).toContain('owner / general_manager / manager')
    expect(FUNCTION_BODY).toContain('host / staff / anonymous denied')
    expect(REPAIR_SQL).toContain('grant execute on function public.repair_inventory_count_current_location(')
    expect(REPAIR_SQL).toContain('to authenticated')
    expect(REPAIR_SQL).toContain('revoke all on function public.repair_inventory_count_current_location(uuid, uuid, boolean) from anon')
  })

  it('locks session and locations FOR UPDATE and scopes to workspace', () => {
    expect(FUNCTION_BODY).toContain('for update of s')
    expect(FUNCTION_BODY).toContain('for update')
    expect(FUNCTION_BODY).toContain('s.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('l.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('inventory_count_repair_workspace_mismatch')
    expect(FUNCTION_BODY).toContain('inventory_count_repair_session_not_found')
  })

  it('rejects counting_complete, posted, and cancelled sessions', () => {
    expect(FUNCTION_BODY).toContain('inventory_count_repair_session_counting_complete')
    expect(FUNCTION_BODY).toContain('inventory_count_repair_session_posted')
    expect(FUNCTION_BODY).toContain('inventory_count_repair_session_cancelled')
    expect(FUNCTION_BODY).toContain("v_session.status not in ('in_progress', 'paused')")
  })

  it('blocks multiple current locations and returns already_valid for one current', () => {
    expect(FUNCTION_BODY).toContain('inventory_count_repair_multiple_current_locations')
    expect(FUNCTION_BODY).toContain("outcome', 'already_valid'")
    expect(FUNCTION_BODY).toContain('already_has_current_location')
    expect(FUNCTION_BODY).toContain("'mutation_performed', false")
  })

  it('requires zero current and at least one location for eligibility', () => {
    expect(FUNCTION_BODY).toContain('zero_locations')
    expect(FUNCTION_BODY).toContain('duplicate_sort_order_ambiguity')
    expect(FUNCTION_BODY).toContain('order by l.sort_order asc, l.created_at asc, l.id asc')
    expect(FUNCTION_BODY).toContain('limit 1')
  })

  it('preview returns proposed fields and never updates when p_preview is true', () => {
    expect(FUNCTION_BODY).toContain('proposed_location_id')
    expect(FUNCTION_BODY).toContain('proposed_location_key')
    expect(FUNCTION_BODY).toContain('proposed_previous_status')
    expect(FUNCTION_BODY).toContain('proposed_new_status')
    expect(FUNCTION_BODY).toContain('eligible')
    expect(FUNCTION_BODY).toContain('blockers')
    expect(FUNCTION_BODY).toContain("'mutation_performed', false")

    const executeSlice = FUNCTION_BODY.slice(
      FUNCTION_BODY.indexOf('-- Execute: promote only the deterministic candidate'),
    )
    expect(executeSlice).toContain("set status = 'current'")
    expect(executeSlice).toContain('set updated_at = v_now')
    expect(FUNCTION_BODY).toContain('if v_preview or not v_eligible then')
  })

  it('execute updates only the candidate location status and preserves inventory/stock', () => {
    const executeSlice = FUNCTION_BODY.slice(
      FUNCTION_BODY.indexOf('-- Execute: promote only the deterministic candidate'),
    )
    expect(executeSlice).toContain('update public.inventory_count_session_locations l')
    expect(executeSlice).toContain("set status = 'current'")
    expect(executeSlice).toContain('update public.inventory_count_sessions s')
    expect(executeSlice).toContain('set updated_at = v_now')
    expect(executeSlice).not.toContain('update public.inventory_count_session_items')
    expect(executeSlice).not.toContain('update public.stock_items')
    expect(executeSlice).not.toContain('insert into public.stock_movements')
    expect(executeSlice).not.toContain('delete from public.stock_movements')
    expect(executeSlice).not.toMatch(/set\s+status\s*=\s*'counting_complete'/i)
    expect(executeSlice).toContain("'session_status_changed', false")
    expect(executeSlice).toContain("'session_items_changed', false")
    expect(executeSlice).toContain("'counted_quantities_changed', false")
    expect(executeSlice).toContain("'stock_quantity_changed', false")
    expect(executeSlice).toContain("'stock_movements_changed', false")
    expect(executeSlice).toContain('current_count_after')
    expect(executeSlice).toContain('inventory_count_repair_postcondition_failed')
  })

  it('documents AMORE.NICOSIA one-session-at-a-time runbook', () => {
    expect(REPAIR_SQL).toContain('5d09543a-9f28-4988-94db-f1ea92742834')
    expect(REPAIR_SQL).toContain('a09c9fdd-d4ee-4308-af92-7823cd8a2cb1')
    expect(REPAIR_SQL).toContain('712e7fd4-2b1d-4382-9e40-491bd3e68a47')
    expect(REPAIR_SQL).toContain('true')
    expect(REPAIR_SQL).toContain('false')
  })
})

describe('create_inventory_count_session current invariant (P8.16.34)', () => {
  it('asserts exactly one current location after insert', () => {
    expect(CREATE_SQL).toContain('inventory_count_session_current_invariant')
    expect(CREATE_SQL).toContain('v_current_location_count')
    expect(CREATE_SQL).toContain("l.status = 'current'")
    expect(CREATE_SQL).toContain('exactly one current location')
    expect(CREATE_SQL).toContain('when ordinality = 1 then \'current\'')
  })
})

describe('repairInventoryCountCurrentLocation service (P8.16.34)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('calls repair RPC in preview mode by default and maps payload', async () => {
    rpcMock.mockResolvedValue({
      data: {
        success: true,
        outcome: 'preview_eligible',
        eligible: true,
        blockers: [],
        mutation_performed: false,
        preview: true,
        session_id: '5d09543a-9f28-4988-94db-f1ea92742834',
        workspace_id: '712e7fd4-2b1d-4382-9e40-491bd3e68a47',
        session_status: 'in_progress',
        total_locations: 1,
        current_count: 0,
        completed_count: 0,
        not_started_count: 1,
        proposed_location_id: 'loc-1',
        proposed_location_key: 'Main Storage',
        proposed_previous_status: 'not_started',
        proposed_new_status: 'current',
        current_count_after: 0,
        mutations: {
          location_status_changed: false,
          session_status_changed: false,
          session_items_changed: false,
          counted_quantities_changed: false,
          stock_quantity_changed: false,
          stock_movements_changed: false,
        },
      },
      error: null,
    })

    const result = await repairInventoryCountCurrentLocation({
      workspaceId: '712e7fd4-2b1d-4382-9e40-491bd3e68a47',
      sessionId: '5d09543a-9f28-4988-94db-f1ea92742834',
    })

    expect(rpcMock).toHaveBeenCalledWith('repair_inventory_count_current_location', {
      p_workspace_id: '712e7fd4-2b1d-4382-9e40-491bd3e68a47',
      p_session_id: '5d09543a-9f28-4988-94db-f1ea92742834',
      p_preview: true,
    })
    expect(result).toMatchObject({
      success: true,
      outcome: 'preview_eligible',
      eligible: true,
      mutationPerformed: false,
      preview: true,
      proposedLocationKey: 'Main Storage',
      proposedPreviousStatus: 'not_started',
      proposedNewStatus: 'current',
      currentCount: 0,
      totalLocations: 1,
    })
  })

  it('executes repair when preview is false', async () => {
    rpcMock.mockResolvedValue({
      data: {
        success: true,
        outcome: 'repaired',
        eligible: true,
        blockers: [],
        mutation_performed: true,
        preview: false,
        session_id: 'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1',
        workspace_id: '712e7fd4-2b1d-4382-9e40-491bd3e68a47',
        session_status: 'in_progress',
        repaired_location_id: 'loc-2',
        repaired_location_key: 'Main Storage',
        previous_status: 'not_started',
        new_status: 'current',
        current_count_after: 1,
        mutations: {
          location_status_changed: true,
          session_status_changed: false,
          session_items_changed: false,
          counted_quantities_changed: false,
          stock_quantity_changed: false,
          stock_movements_changed: false,
        },
      },
      error: null,
    })

    const result = await repairInventoryCountCurrentLocation({
      workspaceId: '712e7fd4-2b1d-4382-9e40-491bd3e68a47',
      sessionId: 'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1',
      preview: false,
    })

    expect(rpcMock).toHaveBeenCalledWith('repair_inventory_count_current_location', {
      p_workspace_id: '712e7fd4-2b1d-4382-9e40-491bd3e68a47',
      p_session_id: 'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1',
      p_preview: false,
    })
    expect(result).toMatchObject({
      outcome: 'repaired',
      mutationPerformed: true,
      repairedLocationKey: 'Main Storage',
      previousStatus: 'not_started',
      newStatus: 'current',
      currentCountAfter: 1,
      sessionStatus: 'in_progress',
      mutations: {
        location_status_changed: true,
        session_status_changed: false,
        session_items_changed: false,
        counted_quantities_changed: false,
        stock_quantity_changed: false,
        stock_movements_changed: false,
      },
    })
  })

  it('maps forbidden and lifecycle rejection errors', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_repair_forbidden' },
    })
    await expect(
      repairInventoryCountCurrentLocation({
        workspaceId: 'ws-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('You do not have permission to repair inventory counts for this workspace.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_repair_session_posted' },
    })
    await expect(
      repairInventoryCountCurrentLocation({
        workspaceId: 'ws-1',
        sessionId: 'session-1',
        preview: false,
      }),
    ).rejects.toThrow('Posted inventory counts cannot be repaired.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_repair_multiple_current_locations' },
    })
    await expect(
      repairInventoryCountCurrentLocation({
        workspaceId: 'ws-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Session has more than one current location; repair refused.')
  })
})

describe('P8.16.34 isolation guards', () => {
  it('does not wire repair into App UI or Inventory Count workspace', () => {
    expect(APP_SOURCE).not.toContain('repairInventoryCountCurrentLocation')
    expect(APP_SOURCE).not.toContain('repair_inventory_count_current_location')
    expect(WORKSPACE_SOURCE).not.toContain('repairInventoryCountCurrentLocation')
    expect(WORKSPACE_SOURCE).not.toContain('repair_inventory_count_current_location')
    expect(SERVICE_SOURCE).toContain('repair_inventory_count_current_location')
    expect(SERVICE_SOURCE).toContain('export async function repairInventoryCountCurrentLocation')
  })
})
