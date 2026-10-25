import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function sql(name) {
  return readFileSync(resolve(process.cwd(), 'supabase', name), 'utf8')
}

const PHASE_A_PUBLIC = [
  'Allow public delete shifts',
  'Allow public insert shifts',
  'Allow public read shifts',
  'Allow public update shifts',
  'Allow public delete reservations',
  'Allow public insert reservations',
  'Allow public read reservations',
  'Allow public update reservations',
  'Allow public delete schedule_publications',
  'Allow public insert schedule_publications',
  'Allow public read schedule_publications',
  'Allow public update schedule_publications',
]

const PHASE_B_PUBLIC = [
  'Allow public delete shift_templates',
  'Allow public insert shift_templates',
  'Allow public read shift_templates',
  'Allow public update shift_templates',
  'Allow public delete schedule_capacity',
  'Allow public insert schedule_capacity',
  'Allow public read schedule_capacity',
  'Allow public update schedule_capacity',
  'Allow all tasks access',
  'Allow public delete inventory_items',
  'Allow public insert inventory_items',
  'Allow public read inventory_items',
  'Allow public update inventory_items',
]

const PHASE_B_DEV = [
  'task_templates_dev_select_all',
  'task_templates_dev_insert_all',
  'task_templates_dev_update_all',
  'task_templates_dev_delete_all',
  'task_template_checklist_items_dev_select_all',
  'task_template_checklist_items_dev_insert_all',
  'task_template_checklist_items_dev_update_all',
  'task_template_checklist_items_dev_delete_all',
  'task_checklist_items_dev_select_all',
  'task_checklist_items_dev_insert_all',
  'task_checklist_items_dev_update_all',
  'task_checklist_items_dev_delete_all',
  'inventory_items_dev_select_all',
  'inventory_items_dev_insert_all',
  'inventory_items_dev_update_all',
  'inventory_items_dev_delete_all',
  'bar_refills_dev_select_all',
  'bar_refills_dev_insert_all',
  'bar_refills_dev_update_all',
  'bar_refills_dev_delete_all',
  'bar_refill_items_dev_select_all',
  'bar_refill_items_dev_insert_all',
  'bar_refill_items_dev_update_all',
  'bar_refill_items_dev_delete_all',
]

describe('close public policy SQL', () => {
  const files = [
    'close_public_policies_phase_a.sql',
    'close_public_policies_phase_a_verify.sql',
    'close_public_policies_phase_a_rollback.sql',
    'close_public_policies_phase_b.sql',
    'close_public_policies_phase_b_verify.sql',
    'close_public_policies_phase_b_rollback.sql',
  ]

  it('marks every file for explicit owner approval and keeps it transactional', () => {
    for (const name of files) {
      const text = sql(name)
      expect(text.startsWith('-- Run with explicit owner approval'), name).toBe(true)
      expect(text).toMatch(/\nbegin;\n/)
      expect(text.trimEnd().endsWith(name.includes('verify') ? 'rollback;' : 'commit;')).toBe(true)
    }
  })

  it('makes verification raise a PASS notice and then roll back', () => {
    for (const name of [
      'close_public_policies_phase_a_verify.sql',
      'close_public_policies_phase_b_verify.sql',
    ]) {
      const text = sql(name)
      expect(text).toContain(`${name.replace('.sql', '').replace('close_public_policies_', 'close_public_policies_')} verify PASS`.replace('_verify', ''))
      expect(text).toContain('verify PASS')
      expect(text.trimEnd().endsWith('rollback;')).toBe(true)
    }
  })

  it('drops only the twelve public policies in phase A and recreates them on rollback', () => {
    const apply = sql('close_public_policies_phase_a.sql')
    const rollback = sql('close_public_policies_phase_a_rollback.sql')

    for (const name of PHASE_A_PUBLIC) {
      expect(apply).toContain(name)
      expect(rollback).toContain(`create policy "${name}"`)
      expect(rollback).toContain('to public')
    }

    expect(apply).not.toContain('drop policy if exists shifts_select_members')
    expect(apply).not.toContain('drop policy if exists reservations_select_members')
    expect(rollback).not.toContain('drop policy if exists shifts_select_members')
  })

  it('recreates every phase B snapshot policy with its original role', () => {
    const apply = sql('close_public_policies_phase_b.sql')
    const rollback = sql('close_public_policies_phase_b_rollback.sql')

    for (const name of [...PHASE_B_PUBLIC, ...PHASE_B_DEV]) {
      expect(apply, name).toContain(name)
      expect(rollback, name).toContain(name.includes(' ') ? `create policy "${name}"` : `create policy ${name}`)
    }

    expect(rollback).toContain('for all')
    expect(rollback).toContain('to public')
    expect(rollback).toContain('to anon, authenticated')
    expect(rollback).toContain('grant select, insert, update, delete on table public.tasks to public, anon, authenticated')
    expect(rollback).toContain('drop column if exists workspace_id')
    expect(rollback).toContain('drop function if exists public.can_complete_workspace_task(uuid, uuid)')
    expect(rollback).not.toContain('public.shifts')
    expect(rollback).not.toContain('public.reservations')
    expect(rollback).not.toContain('public.schedule_publications')
  })

  it('adds workspace_id only on the three parent tables', () => {
    const apply = sql('close_public_policies_phase_b.sql')
    expect(apply).toContain('alter table public.shift_templates')
    expect(apply).toContain('alter table public.tasks')
    expect(apply).toContain('alter table public.task_templates')
    expect(apply).not.toMatch(/alter table public\.schedule_capacity\s+add column/i)
    expect(apply).not.toMatch(/alter table public\.task_checklist_items\s+add column/i)
    expect(apply).not.toMatch(/alter table public\.task_template_checklist_items\s+add column/i)
    expect(apply).toContain('can_manage_workspace_stock')
    expect(apply).toContain('can_manage_any_workspace_schedule')
    expect(apply).toContain('has_any_workspace_membership')
    expect(apply).toContain('can_complete_workspace_task')
  })
})
