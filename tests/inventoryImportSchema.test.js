// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../supabase/inventory_import_schema.sql',
)
const sql = readFileSync(sqlPath, 'utf8')

const SESSION_STATUSES = [
  'draft',
  'parsing',
  'mapping',
  'validating',
  'review',
  'ready',
  'applying',
  'completed',
  'failed',
  'cancelled',
]

const VALIDATION_STATES = ['pending', 'valid', 'warning', 'error']

const CONFLICT_STATES = [
  'none',
  'exact_match',
  'possible_match',
  'duplicate_in_file',
  'duplicate_previous_import',
  'ambiguous',
]

const ACTIONS = ['create', 'link', 'update', 'skip', 'manual_review']

const APPLY_STATES = ['pending', 'applied', 'skipped', 'failed']

describe('inventory_import_schema.sql — Import V1 foundation contract', () => {
  it('creates both staging tables and session → row FK with cascade', () => {
    expect(sql).toContain('create table if not exists public.inventory_import_sessions')
    expect(sql).toContain('create table if not exists public.inventory_import_rows')
    expect(sql).toMatch(
      /session_id uuid not null\s+references public\.inventory_import_sessions\(id\) on delete cascade/,
    )
  })

  it('locks exact session status set with default draft', () => {
    expect(sql).toContain("default 'draft'")
    for (const status of SESSION_STATUSES) {
      expect(sql).toContain(`'${status}'`)
    }
    expect(sql).toMatch(
      /constraint inventory_import_sessions_status_chk\s+check \(status in \([\s\S]*?'cancelled'[\s\S]*?\)\)/,
    )
  })

  it('locks exact row validation, conflict, action, and apply state sets', () => {
    expect(sql).toContain("default 'pending'")
    expect(sql).toContain("default 'none'")

    for (const state of VALIDATION_STATES) {
      expect(sql).toContain(`'${state}'`)
    }
    for (const state of CONFLICT_STATES) {
      expect(sql).toContain(`'${state}'`)
    }
    for (const action of ACTIONS) {
      expect(sql).toContain(`'${action}'`)
    }
    for (const state of APPLY_STATES) {
      expect(sql).toContain(`'${state}'`)
    }

    expect(sql).toContain('proposed_action')
    expect(sql).toContain('selected_action')
    expect(sql).toContain('confirm_quantity_update boolean not null default false')
    expect(sql).toContain('confirm_location_fallback boolean not null default false')
  })

  it('keeps raw and normalized payloads separate with mapping evidence', () => {
    expect(sql).toContain('raw_payload jsonb not null default')
    expect(sql).toContain('normalized_payload jsonb not null default')
    expect(sql).toContain('mapping_evidence jsonb not null default')
    expect(sql).toContain('validation_messages jsonb not null default')
    expect(sql).toContain('conflict_evidence jsonb not null default')
  })

  it('uniques session row numbers but does not unique row fingerprints', () => {
    expect(sql).toContain('constraint inventory_import_rows_session_row_uidx')
    expect(sql).toContain('unique (session_id, source_row_number)')
    expect(sql).toContain('inventory_import_rows_session_source_fingerprint_idx')
    expect(sql).not.toMatch(
      /unique\s*\(\s*session_id\s*,\s*source_fingerprint\s*\)/i,
    )
    expect(sql).toContain('duplicate_in_file rows are staged for review')
  })

  it('supports apply evidence and workspace-scoped apply idempotency', () => {
    expect(sql).toContain('apply_started_at')
    expect(sql).toContain('apply_completed_at')
    expect(sql).toContain('apply_started_by')
    expect(sql).toContain('apply_idempotency_key')
    expect(sql).toContain('apply_result jsonb not null default')
    expect(sql).toContain('failure_summary')
    expect(sql).toContain('inventory_import_sessions_apply_idempotency_uidx')
    expect(sql).toContain('(workspace_id, apply_idempotency_key)')
    expect(sql).toContain('where apply_idempotency_key is not null')
  })

  it('enables RLS with membership reads and can_manage_workspace_stock writes', () => {
    expect(sql).toMatch(
      /alter table public\.inventory_import_sessions enable row level security/,
    )
    expect(sql).toMatch(
      /alter table public\.inventory_import_rows enable row level security/,
    )
    expect(sql).toContain('using (public.is_workspace_member(workspace_id))')
    expect(sql).toContain('with check (public.can_manage_workspace_stock(workspace_id))')
    expect(sql).toContain('public.can_manage_workspace_stock(s.workspace_id)')
    expect(sql).toContain('public.is_workspace_member(s.workspace_id)')
    expect(sql).toContain('from public.inventory_import_sessions s')
    expect(sql).toContain('revoke all on table public.inventory_import_sessions from anon')
    expect(sql).toContain('revoke all on table public.inventory_import_rows from anon')
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(sql).not.toMatch(/to anon/i)
  })

  it('qualifies inventory_import_rows workspace/session in every row RLS subquery', () => {
    const rowsPolicySection = sql.slice(
      sql.indexOf('drop policy if exists inventory_import_rows_select_members'),
    )

    expect(rowsPolicySection).not.toContain('s.workspace_id = s.workspace_id')
    expect(rowsPolicySection).not.toMatch(
      /from public\.inventory_import_sessions s\s+where s\.id = session_id/,
    )
    expect(rowsPolicySection).not.toMatch(
      /s\.workspace_id = workspace_id(?!\.)/,
    )

    const expectedRowPredicate = [
      'where s.id = inventory_import_rows.session_id',
      'and s.workspace_id = inventory_import_rows.workspace_id',
    ].join('\n')

    const selectBlock = rowsPolicySection.slice(
      rowsPolicySection.indexOf('create policy inventory_import_rows_select_members'),
      rowsPolicySection.indexOf('create policy inventory_import_rows_insert_managers'),
    )
    const insertBlock = rowsPolicySection.slice(
      rowsPolicySection.indexOf('create policy inventory_import_rows_insert_managers'),
      rowsPolicySection.indexOf('create policy inventory_import_rows_update_managers'),
    )
    const updateBlock = rowsPolicySection.slice(
      rowsPolicySection.indexOf('create policy inventory_import_rows_update_managers'),
      rowsPolicySection.indexOf('create policy inventory_import_rows_delete_managers'),
    )
    const deleteBlock = rowsPolicySection.slice(
      rowsPolicySection.indexOf('create policy inventory_import_rows_delete_managers'),
    )

    for (const block of [selectBlock, insertBlock, updateBlock, deleteBlock]) {
      expect(block).toContain('inventory_import_rows.workspace_id')
      expect(block).toContain('inventory_import_rows.session_id')
      expect(block.replace(/\s+/g, ' ')).toContain(
        expectedRowPredicate.replace(/\s+/g, ' '),
      )
    }

    expect(selectBlock).toContain('public.is_workspace_member(s.workspace_id)')
    expect(insertBlock).toContain('public.can_manage_workspace_stock(s.workspace_id)')
    expect(updateBlock).toContain('public.can_manage_workspace_stock(s.workspace_id)')
    expect(deleteBlock).toContain('public.can_manage_workspace_stock(s.workspace_id)')

    const usingIdx = updateBlock.indexOf('using (')
    const withCheckIdx = updateBlock.indexOf('with check (')
    expect(usingIdx).toBeGreaterThan(-1)
    expect(withCheckIdx).toBeGreaterThan(usingIdx)
    expect(updateBlock.slice(usingIdx, withCheckIdx)).toContain(
      'inventory_import_rows.workspace_id',
    )
    expect(updateBlock.slice(withCheckIdx)).toContain(
      'inventory_import_rows.workspace_id',
    )
  })

  it('does not create Apply RPC, parser, or couple to migration/legacy stock writes', () => {
    const withoutLineComments = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')

    expect(withoutLineComments).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.(?!is_workspace_member|can_manage_workspace_stock|set_inventory_import_)/i,
    )
    expect(withoutLineComments).not.toContain('inventory_stock_item_map')
    expect(withoutLineComments).not.toContain('inventory_migration_sessions')
    expect(withoutLineComments).not.toContain('inventory_items')
    expect(withoutLineComments).not.toMatch(/insert\s+into\s+public\.stock_items/i)
    expect(withoutLineComments).not.toMatch(/update\s+public\.stock_items/i)
    expect(withoutLineComments).not.toMatch(/insert\s+into\s+public\.inventory_items/i)
    expect(sql).toContain('Apply RPC writes stock_items later')
    expect(sql).toContain('Separate from inventory migration')
  })

  it('defaults contract_version to import_v1.0 and limits formats to csv/xlsx', () => {
    expect(sql).toContain("default 'import_v1.0'")
    expect(sql).toMatch(/source_format in \('csv', 'xlsx'\)/)
    expect(sql).not.toMatch(/source_format in \([^)]*'xls'[^)]*\)/)
  })
})
