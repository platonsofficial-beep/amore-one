import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('inventory_count_reversal_lineage_schema SQL contract (P8.22.5 / P8.22.5a)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_reversal_lineage_schema.sql'),
    'utf8',
  )
  const headerSql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_reversals_schema.sql'),
    'utf8',
  )
  const movementsSql = readFileSync(
    resolve(process.cwd(), 'supabase/stock_movements_schema.sql'),
    'utf8',
  )
  const executableSql = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  it('adds a unique index guaranteeing one reversal header per session', () => {
    expect(sql).toContain('create unique index if not exists inventory_count_reversals_session_uidx')
    expect(sql).toContain('on public.inventory_count_reversals (session_id)')
    expect(headerSql).toContain('create table if not exists public.inventory_count_reversals')
  })

  it('creates reversal lines with CASCADE ownership FKs and SET NULL item/movement retention FKs (P8.22.5a)', () => {
    expect(sql).toContain('create table if not exists public.inventory_count_reversal_lines')
    expect(sql).toContain('reversal_id uuid not null')
    expect(sql).toContain('workspace_id uuid not null')
    expect(sql).toContain('session_id uuid not null')
    expect(sql).toMatch(/item_id uuid\n\s+references public\.stock_items\(id\) on delete set null/)
    expect(sql).toMatch(
      /original_movement_id uuid\n\s+references public\.stock_movements\(id\) on delete set null/,
    )
    expect(sql).toMatch(
      /reversal_movement_id uuid\n\s+references public\.stock_movements\(id\) on delete set null/,
    )
    expect(sql).not.toMatch(/item_id uuid not null/)
    expect(sql).not.toMatch(/original_movement_id uuid not null/)
    expect(sql).not.toMatch(/reversal_movement_id uuid not null/)
    expect(sql).not.toMatch(/on delete restrict/i)
    expect(sql).toContain('original_quantity numeric(12, 3) not null')
    expect(sql).toContain('reversal_quantity numeric(12, 3) not null')
    expect(sql).toContain('references public.inventory_count_reversals(id) on delete cascade')
    expect(sql).toContain('references public.workspaces(id) on delete cascade')
    expect(sql).toContain('references public.inventory_count_sessions(id) on delete cascade')
    expect(movementsSql).toContain('references public.stock_items(id) on delete cascade')
  })

  it('enforces distinct movement ids (null-safe), unique movement links, and inverse quantity', () => {
    expect(sql).toContain('inventory_count_reversal_lines_movement_ids_distinct_chk')
    expect(sql).toContain('original_movement_id is null')
    expect(sql).toContain('reversal_movement_id is null')
    expect(sql).toContain('original_movement_id is distinct from reversal_movement_id')
    expect(sql).toContain('inventory_count_reversal_lines_quantity_inverse_chk')
    expect(sql).toContain('check (reversal_quantity = -original_quantity)')
    expect(sql).toContain(
      'create unique index if not exists inventory_count_reversal_lines_original_movement_uidx',
    )
    expect(sql).toContain(
      'create unique index if not exists inventory_count_reversal_lines_reversal_movement_uidx',
    )
  })

  it('follows append-only member select RLS without client write policies or RPC/stock mutation', () => {
    expect(sql).toContain('grant select on table public.inventory_count_reversal_lines to authenticated')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('inventory_count_reversal_lines_select_members')
    expect(sql).toContain('for select')
    expect(sql).toContain('public.is_workspace_member(workspace_id)')
    expect(executableSql).not.toMatch(/\bfor\s+insert\b/i)
    expect(executableSql).not.toMatch(/\bfor\s+update\b/i)
    expect(executableSql).not.toMatch(/\bfor\s+delete\b/i)
    expect(executableSql).not.toMatch(/\bcreate\s+or\s+replace\s+function\b/i)
    expect(executableSql).not.toMatch(/\breverse_inventory_count/i)
    expect(executableSql).not.toMatch(/\binsert\s+into\s+public\.stock_movements\b/i)
    expect(executableSql).not.toMatch(/\bupdate\s+public\.stock_items\b/i)
    expect(executableSql).not.toMatch(/\balter\s+table\s+public\.inventory_count_sessions\b/i)
  })
})
