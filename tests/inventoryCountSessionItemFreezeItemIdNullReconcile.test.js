/**
 * @vitest-environment node
 * P8.16.38 — Historical snapshot FK nulling reconcile (freeze trigger + Permanent Delete path).
 *
 * Repository tests are SQL-contract based (no live Postgres). Behavioral cases are
 * encoded as assertions on the freeze function, FK, and Permanent Delete RPC so the
 * real delete → ON DELETE SET NULL → BEFORE UPDATE path remains the intended design.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

const RECONCILE_SQL = readFileSync(
  join(HERE, '../supabase/inventory_count_session_item_freeze_item_id_null_reconcile.sql'),
  'utf8',
)
const HARDENING_SQL = readFileSync(
  join(HERE, '../supabase/inventory_count_snapshot_at_hardening.sql'),
  'utf8',
)
const SCHEMA_SQL = readFileSync(
  join(HERE, '../supabase/inventory_count_schema.sql'),
  'utf8',
)
const DELETE_SQL = readFileSync(
  join(HERE, '../supabase/stock_item_permanent_delete_rpc.sql'),
  'utf8',
)

function freezeFunctionBody(sql) {
  const start = sql.indexOf(
    'create or replace function public.protect_inventory_count_session_item_freeze_fields()',
  )
  const end = sql.indexOf('$$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end + 3)
}

const RECONCILE_FN = freezeFunctionBody(RECONCILE_SQL)
const HARDENING_FN = freezeFunctionBody(HARDENING_SQL)

const DELETE_FN = DELETE_SQL.slice(
  DELETE_SQL.indexOf('create or replace function public.delete_stock_item_permanently'),
  DELETE_SQL.indexOf('comment on function public.delete_stock_item_permanently'),
)

const OPEN_GATE = DELETE_FN.slice(
  DELETE_FN.indexOf('-- 4) Inventory count references'),
  DELETE_FN.indexOf('-- 5) Collect deletion statistics'),
)

describe('P8.16.38 reconcile SQL deployment contract', () => {
  it('replaces only the freeze function and rebinds the existing BEFORE UPDATE trigger', () => {
    expect(RECONCILE_SQL).toContain('P8.16.38')
    expect(RECONCILE_SQL).toContain(
      'create or replace function public.protect_inventory_count_session_item_freeze_fields()',
    )
    expect(RECONCILE_SQL).toContain('drop trigger if exists inventory_count_session_items_protect_freeze_fields')
    expect(RECONCILE_SQL).toContain('before update on public.inventory_count_session_items')
    expect(RECONCILE_SQL).toContain(
      'execute function public.protect_inventory_count_session_item_freeze_fields()',
    )
    expect(RECONCILE_SQL).not.toMatch(/alter\s+table\s+public\.inventory_count_session_items/i)
    expect(RECONCILE_SQL).not.toMatch(/delete\s+from\s+public\.inventory_count_session_items/i)
    expect(RECONCILE_SQL).not.toMatch(/delete\s+from\s+public\.stock_items/i)
    expect(RECONCILE_SQL).not.toMatch(/disable\s+trigger/i)
    expect(RECONCILE_SQL).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.delete_stock_item_permanently/i,
    )
    expect(RECONCILE_FN).not.toContain('delete_stock_item_permanently')
  })

  it('keeps hardening source of truth aligned with reconcile freeze logic', () => {
    expect(HARDENING_FN).toContain('old.item_id is not null and new.item_id is null')
    expect(RECONCILE_FN).toContain('old.item_id is not null and new.item_id is null')
    expect(HARDENING_FN).toContain('inventory_count_item_frozen_field')
    expect(RECONCILE_FN).toContain('inventory_count_item_frozen_field')
  })
})

describe('P8.16.38 narrow item_id nulling exception', () => {
  it('allows only non-null item_id → NULL and still raises for other item_id mutations', () => {
    for (const body of [RECONCILE_FN, HARDENING_FN]) {
      expect(body).toContain('new.item_id is distinct from old.item_id')
      expect(body).toContain('old.item_id is not null and new.item_id is null')
      expect(body).toMatch(
        /if new\.item_id is distinct from old\.item_id\s+and not \(old\.item_id is not null and new\.item_id is null\) then\s+raise exception 'inventory_count_item_frozen_field'/s,
      )
      // Must not keep the old blanket "any item_id change" in the same OR list as other fields
      expect(body).not.toMatch(
        /new\.workspace_id is distinct from old\.workspace_id\s+or\s+new\.item_id is distinct from old\.item_id\s+or\s+new\.item_name/s,
      )
    }
  })

  it('keeps every other copied snapshot field frozen', () => {
    for (const body of [RECONCILE_FN, HARDENING_FN]) {
      for (const field of [
        'session_id',
        'workspace_id',
        'item_name',
        'category',
        'item_type',
        'unit',
        'storage_location',
        'expected_snapshot',
        'created_at',
      ]) {
        expect(body).toContain(`new.${field} is distinct from old.${field}`)
      }
      expect(body).toContain("raise exception 'inventory_count_item_frozen_field'")
    }
  })

  it('does not create a blanket trigger bypass', () => {
    for (const body of [RECONCILE_FN, HARDENING_FN]) {
      expect(body).toContain("if tg_op <> 'UPDATE'")
      expect(body).toContain("raise exception 'inventory_count_item_frozen_field'")
      // Must still evaluate freeze comparisons before returning NEW
      expect(body.indexOf('new.item_name is distinct from old.item_name'))
        .toBeLessThan(body.lastIndexOf('return new;'))
      expect(body.indexOf('old.item_id is not null and new.item_id is null'))
        .toBeLessThan(body.lastIndexOf('return new;'))
    }
  })
})

describe('P8.16.38 FK-driven Permanent Delete path (contract)', () => {
  it('keeps session_items.item_id ON DELETE SET NULL so delete nulls the live FK', () => {
    expect(SCHEMA_SQL).toMatch(
      /item_id uuid\s+references public\.stock_items\(id\) on delete set null/i,
    )
    expect(SCHEMA_SQL).toContain('Nullable after stock item deletion')
    expect(SCHEMA_SQL).toContain('where item_id is not null')
  })

  it('Permanent Delete deletes only stock_items and never deletes count session items', () => {
    expect(DELETE_FN).toContain('delete from public.stock_items s')
    expect(DELETE_FN).not.toMatch(/delete\s+from\s+public\.inventory_count_session_items/i)
    expect(DELETE_FN).not.toMatch(/delete\s+from\s+public\.inventory_count_sessions/i)
    expect(DELETE_FN).toContain("'inventory_count_snapshots'")
    expect(DELETE_FN).toContain("'posted_refs'")
    expect(DELETE_FN).toContain("'cancelled_refs'")
    expect(DELETE_FN).toContain("'success', true")
  })

  it('historical posted/cancelled refs are preserved stats only, not open blockers', () => {
    expect(OPEN_GATE).toContain("cs.status = 'posted'")
    expect(OPEN_GATE).toContain("cs.status = 'cancelled'")
    expect(OPEN_GATE).toMatch(/Preserved snapshot stats only/)

    const existsBlock = OPEN_GATE.slice(
      OPEN_GATE.search(/if exists/i),
      OPEN_GATE.indexOf('raise exception'),
    )
    expect(existsBlock).not.toContain("'posted'")
    expect(existsBlock).not.toContain("'cancelled'")
  })

  it('open count statuses still block Permanent Delete', () => {
    expect(OPEN_GATE).toContain("cs.status in ('in_progress', 'paused', 'counting_complete')")
    expect(OPEN_GATE).toContain('stock_item_permanent_delete_blocked_open_count')
    for (const status of ['in_progress', 'paused', 'counting_complete']) {
      expect(OPEN_GATE).toContain(`'${status}'`)
    }
  })

  it('does not alter Permanent Delete authorization, PO blockers, or cascade contract', () => {
    expect(DELETE_FN).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(DELETE_FN).toContain('stock_item_permanent_delete_blocked_draft_order')
    expect(DELETE_FN).toContain('stock_item_permanent_delete_blocked_sent_order')
    expect(DELETE_FN).toContain("'stock_movements', true")
    expect(DELETE_FN).toContain("'manual_movement_delete', false")
    expect(DELETE_FN).not.toMatch(/delete\s+from\s+public\.stock_movements/i)
  })
})

describe('P8.16.38 lifecycle field non-interference (contract)', () => {
  it('freeze guard does not mention counted/posting mutable lifecycle columns', () => {
    for (const body of [RECONCILE_FN, HARDENING_FN]) {
      expect(body).not.toContain('counted_quantity')
      expect(body).not.toContain('counted_at')
      expect(body).not.toContain('line_status')
      expect(body).not.toContain('expected_at_count')
      expect(body).not.toContain('variance_quantity')
      expect(body).not.toContain('live_quantity_at_post')
      expect(body).not.toContain('posted_movement_id')
      expect(body).not.toContain('note')
    }
  })
})
