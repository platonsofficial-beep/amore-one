/**
 * @vitest-environment node
 * Unapplied bundle for the four missing inventory import session functions.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(HERE, '../supabase/inventory_import_session_functions.sql'), 'utf8')
const ROLLBACK = readFileSync(join(HERE, '../supabase/inventory_import_session_functions_rollback.sql'), 'utf8')
const VERIFY = readFileSync(join(HERE, '../supabase/inventory_import_session_functions_verify.sql'), 'utf8')
const STAGING = readFileSync(join(HERE, '../supabase/inventory_import_session_staging_rpcs.sql'), 'utf8')
const READY = readFileSync(join(HERE, '../supabase/inventory_import_ready_rpc.sql'), 'utf8')

const NAMES = [
  'create_inventory_import_session',
  'stage_inventory_import_rows',
  'cancel_inventory_import_session',
  'mark_inventory_import_session_ready',
]

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const commentIdx = source.indexOf(`comment on function public.${name}`, start)
  return source.slice(start, commentIdx)
}

describe('inventory import session function bundle', () => {
  it('creates the four missing functions and does not replace apply', () => {
    for (const name of NAMES) {
      expect(SQL).toContain(`create or replace function public.${name}`)
      expect(SQL).toContain(`grant execute on function public.${name}`)
      expect(SQL).toMatch(new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public`, 'i'))
      expect(SQL).toMatch(new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from anon`, 'i'))
    }
    expect(SQL).not.toMatch(/create or replace function public\.apply_inventory_import_session/i)
    expect(SQL).not.toMatch(/drop function if exists public\.apply_inventory_import_session/i)
    expect(SQL.match(/language plpgsql\s+security definer/gi)).toHaveLength(4)
    expect(SQL.match(/set search_path = public/g)).toHaveLength(4)
    expect(SQL.match(/can_manage_workspace_stock/g).length).toBeGreaterThanOrEqual(4)
    expect(SQL).toContain('NOT APPLIED')
  })

  it('keeps the same function bodies as the existing unapplied drafts', () => {
    for (const name of NAMES.slice(0, 3)) {
      expect(functionBody(SQL, name)).toBe(functionBody(STAGING, name))
    }
    expect(functionBody(SQL, 'mark_inventory_import_session_ready'))
      .toBe(functionBody(READY, 'mark_inventory_import_session_ready'))
  })

  it('rolls back only the four functions', () => {
    for (const name of NAMES) {
      expect(ROLLBACK).toContain(`drop function if exists public.${name}`)
    }
    expect(ROLLBACK).not.toMatch(/drop function if exists public\.apply_inventory_import_session/i)
    expect(ROLLBACK).not.toMatch(/\bdrop table\b/i)
    expect(ROLLBACK).not.toMatch(/\bdelete from\b/i)
  })

  it('verifies with read-only selects', () => {
    expect(VERIFY).toMatch(/\bselect\b/i)
    expect(VERIFY).not.toMatch(/\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i)
    for (const name of NAMES) {
      expect(VERIFY).toContain(name)
    }
  })
})
