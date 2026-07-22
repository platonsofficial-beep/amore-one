// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('P8.13.0 Phase 1 production verification artifacts', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const validationPath = join(
    root,
    'supabase/inventory_migration_phase1_runtime_validation.sql',
  )
  const phase1RpcPath = join(root, 'supabase/inventory_migration_phase1_rpc.sql')
  const runbookPath = join(root, 'docs/stock_inventory_migration_runbook.md')
  const servicePath = join(
    root,
    'src/services/inventoryMigrationExecutionService.js',
  )
  const operatorPath = join(
    root,
    'src/components/stock/StockMigrationOperatorPanel.jsx',
  )
  const eligibilityPath = join(
    root,
    'src/lib/inventoryMigrationOperatorEligibility.js',
  )

  const validationSql = readFileSync(validationPath, 'utf8')
  const phase1Rpc = readFileSync(phase1RpcPath, 'utf8')
  const runbook = readFileSync(runbookPath, 'utf8')
  const service = readFileSync(servicePath, 'utf8')
  const operator = readFileSync(operatorPath, 'utf8')
  const eligibility = readFileSync(eligibilityPath, 'utf8')

  it('provides read-only Phase 1 runtime validation SQL', () => {
    expect(validationSql).toContain('P8.13.0')
    expect(validationSql).toContain('READ-ONLY')
    expect(validationSql).toContain(
      "to_regprocedure('public.run_inventory_migration_phase1(uuid,uuid)')",
    )
    expect(validationSql).toContain('has_function_privilege')
    expect(validationSql).toContain('authenticated')
    expect(validationSql).toContain('INITIAL_IMPORT|map_id=')
    expect(validationSql).toContain("step_name = 'phase1'")
    expect(validationSql).toContain('inventory_migration_step_results')
    expect(validationSql).toContain('DEPRECATED')
    expect(validationSql).toContain('inventory_movement_execute_phase1.sql')
    expect(validationSql).not.toMatch(/\bcommit\s*;/i)
    expect(validationSql).not.toMatch(/\binsert\s+into\b/i)
    expect(validationSql).not.toMatch(/\bupdate\s+public\./i)
    expect(validationSql).not.toMatch(/\bdelete\s+from\b/i)
    expect(validationSql).not.toMatch(
      /select\s+\*\s+from\s+public\.run_inventory_migration_phase1\s*\(/i,
    )
    expect(validationSql).not.toMatch(
      /perform\s+public\.run_inventory_migration_phase1\s*\(/i,
    )
  })

  it('keeps Phase 1 RPC contract and grants unchanged for production', () => {
    expect(phase1Rpc).toContain(
      'create or replace function public.run_inventory_migration_phase1(',
    )
    expect(phase1Rpc).toContain(
      'grant execute on function public.run_inventory_migration_phase1(uuid, uuid) to authenticated',
    )
    expect(phase1Rpc).toContain(
      'revoke all on function public.run_inventory_migration_phase1(uuid, uuid) from public',
    )
    expect(phase1Rpc).toContain(
      'revoke all on function public.run_inventory_migration_phase1(uuid, uuid) from anon',
    )
    expect(phase1Rpc).toContain("note = 'INITIAL_IMPORT|map_id=<inventory_stock_item_map.id>'")
  })

  it('documents canonical Operator Panel flow and deprecates legacy DO-block', () => {
    expect(runbook).toContain('Canonical production Phase 1 path')
    expect(runbook).toContain('run_inventory_migration_phase1')
    expect(runbook).toContain('inventory_migration_phase1_runtime_validation.sql')
    expect(runbook).toContain('DEPRECATED')
    expect(runbook).toContain('inventory_movement_execute_phase1.sql')
    expect(runbook).toContain('to_regprocedure')
    expect(runbook).toMatch(/Operator Panel/)
  })

  it('keeps Operator Panel + service on the canonical RPC only', () => {
    expect(service).toContain("const RUN_PHASE1_RPC = 'run_inventory_migration_phase1'")
    expect(service).toContain('export async function runInventoryMigrationPhase1')
    expect(service).not.toContain('inventory_movement_execute_phase1')
    expect(operator).toContain('runInventoryMigrationPhase1')
    expect(operator).toContain("'Phase 1': 'phase-1'")
    expect(operator).toContain('onRefresh')
    expect(operator).not.toContain('inventory_movement_execute_phase1')
    expect(eligibility).toContain("'phase-1'")
    expect(eligibility).toContain("stepName: 'phase1'")
    expect(eligibility).toContain("predecessor: 'preview'")
    expect(eligibility).toContain("attentionPriorStep: 'preview'")
  })
})
