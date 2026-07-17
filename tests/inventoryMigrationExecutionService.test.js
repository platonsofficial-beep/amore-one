// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let rpcResult = { data: null, error: null }

  return {
    setRpcResult(result) {
      rpcResult = result
    },
    reset() {
      rpcResult = { data: null, error: null }
      this.rpc.mockClear()
      this.rpc.mockImplementation(async () => rpcResult)
    },
    rpc: vi.fn(async () => rpcResult),
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => supabaseMocks.rpc(...args),
  },
}))

import {
  acknowledgeInventoryMigrationStageAttention,
  cancelInventoryMigrationSession,
  completeInventoryMigrationFoundationStep,
  completeInventoryMigrationSession,
  runInventoryMigrationAutoCreate,
  runInventoryMigrationAutoLink,
  runInventoryMigrationIntegrityAudit,
  runInventoryMigrationPersist,
  runInventoryMigrationPhase1,
  runInventoryMigrationPhase2,
  runInventoryMigrationPostApplyAudit,
  runInventoryMigrationPreflight,
  runInventoryMigrationPreview,
  startInventoryMigrationSession,
} from '../src/services/inventoryMigrationExecutionService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'
const PRIOR_RESULT_ID = 'res-33333333-3333-3333-3333-333333333333'

const STAGE_OUTCOME = Object.freeze({
  session_id: SESSION_ID,
  step_name: 'persist',
  result_status: 'passed',
})

describe('inventoryMigrationExecutionService write wrappers', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  describe('session lifecycle', () => {
    it('startInventoryMigrationSession calls exact RPC with workspace only', async () => {
      const payload = [{ id: SESSION_ID, status: 'running' }]
      supabaseMocks.setRpcResult({ data: payload, error: null })

      await expect(startInventoryMigrationSession(WORKSPACE_ID)).resolves.toEqual(payload)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('start_inventory_migration_session', {
        p_workspace_id: WORKSPACE_ID,
      })
    })

    it('cancelInventoryMigrationSession calls exact RPC args', async () => {
      const payload = [{ id: SESSION_ID, status: 'cancelled' }]
      supabaseMocks.setRpcResult({ data: payload, error: null })

      await expect(
        cancelInventoryMigrationSession(WORKSPACE_ID, SESSION_ID),
      ).resolves.toEqual(payload)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('cancel_inventory_migration_session', {
        p_workspace_id: WORKSPACE_ID,
        p_session_id: SESSION_ID,
      })
    })

    it('completeInventoryMigrationSession calls exact RPC args', async () => {
      const payload = [{ id: SESSION_ID, status: 'completed' }]
      supabaseMocks.setRpcResult({ data: payload, error: null })

      await expect(
        completeInventoryMigrationSession(WORKSPACE_ID, SESSION_ID),
      ).resolves.toEqual(payload)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('complete_inventory_migration_session', {
        p_workspace_id: WORKSPACE_ID,
        p_session_id: SESSION_ID,
      })
    })
  })

  describe('foundation transition', () => {
    it('completeInventoryMigrationFoundationStep targets foundation → completed only', async () => {
      const payload = [{ step_name: 'foundation', status: 'completed' }]
      supabaseMocks.setRpcResult({ data: payload, error: null })

      await expect(
        completeInventoryMigrationFoundationStep(WORKSPACE_ID, SESSION_ID),
      ).resolves.toEqual(payload)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('transition_inventory_migration_step', {
        p_workspace_id: WORKSPACE_ID,
        p_session_id: SESSION_ID,
        p_step_name: 'foundation',
        p_target_status: 'completed',
      })
    })

    it('does not expose arbitrary step transition API on the module', async () => {
      const mod = await import('../src/services/inventoryMigrationExecutionService')
      expect(mod.transitionInventoryMigrationStep).toBeUndefined()
      expect(mod.completeInventoryMigrationFoundationStep).toEqual(
        expect.any(Function),
      )
    })
  })

  describe.each([
    ['runInventoryMigrationPersist', runInventoryMigrationPersist, 'run_inventory_migration_persist'],
    ['runInventoryMigrationAutoLink', runInventoryMigrationAutoLink, 'run_inventory_migration_auto_link'],
    ['runInventoryMigrationAutoCreate', runInventoryMigrationAutoCreate, 'run_inventory_migration_auto_create'],
    ['runInventoryMigrationIntegrityAudit', runInventoryMigrationIntegrityAudit, 'run_inventory_migration_integrity_audit'],
    ['runInventoryMigrationPreflight', runInventoryMigrationPreflight, 'run_inventory_migration_preflight'],
    ['runInventoryMigrationPreview', runInventoryMigrationPreview, 'run_inventory_migration_preview'],
    ['runInventoryMigrationPhase1', runInventoryMigrationPhase1, 'run_inventory_migration_phase1'],
    ['runInventoryMigrationPostApplyAudit', runInventoryMigrationPostApplyAudit, 'run_inventory_migration_post_apply_audit'],
  ])('%s', (_name, fn, rpcName) => {
    it('calls exact RPC with workspace and session only', async () => {
      supabaseMocks.setRpcResult({ data: STAGE_OUTCOME, error: null })

      await expect(fn(WORKSPACE_ID, SESSION_ID)).resolves.toEqual(STAGE_OUTCOME)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(rpcName, {
        p_workspace_id: WORKSPACE_ID,
        p_session_id: SESSION_ID,
      })
    })

    it('propagates Supabase error without secondary RPC', async () => {
      const rpcError = { message: `${rpcName}_failed`, code: 'P0001' }
      supabaseMocks.setRpcResult({ data: null, error: rpcError })

      await expect(fn(WORKSPACE_ID, SESSION_ID)).rejects.toBe(rpcError)
      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
    })
  })

  describe('runInventoryMigrationPhase2', () => {
    it('forwards caller-provided maintenance confirmation boolean exactly', async () => {
      supabaseMocks.setRpcResult({ data: STAGE_OUTCOME, error: null })

      await expect(
        runInventoryMigrationPhase2(WORKSPACE_ID, SESSION_ID, true),
      ).resolves.toEqual(STAGE_OUTCOME)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('run_inventory_migration_phase2', {
        p_workspace_id: WORKSPACE_ID,
        p_session_id: SESSION_ID,
        p_confirm_maintenance_window: true,
      })

      supabaseMocks.reset()
      supabaseMocks.setRpcResult({ data: STAGE_OUTCOME, error: null })

      await runInventoryMigrationPhase2(WORKSPACE_ID, SESSION_ID, false)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith('run_inventory_migration_phase2', {
        p_workspace_id: WORKSPACE_ID,
        p_session_id: SESSION_ID,
        p_confirm_maintenance_window: false,
      })
    })

    it('does not silently force true when confirmation is missing', async () => {
      await expect(
        runInventoryMigrationPhase2(WORKSPACE_ID, SESSION_ID),
      ).rejects.toThrow('Maintenance window confirmation boolean is required.')
      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('propagates Supabase error', async () => {
      const rpcError = { message: 'inventory_migration_phase2_forbidden' }
      supabaseMocks.setRpcResult({ data: null, error: rpcError })

      await expect(
        runInventoryMigrationPhase2(WORKSPACE_ID, SESSION_ID, true),
      ).rejects.toBe(rpcError)
      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
    })
  })

  describe('acknowledgeInventoryMigrationStageAttention', () => {
    it('forwards exact prior_result_id, next_step_name, and optional note', async () => {
      const payload = [{ id: 'ack-1', next_step_name: 'preflight' }]
      supabaseMocks.setRpcResult({ data: payload, error: null })

      await expect(
        acknowledgeInventoryMigrationStageAttention(
          WORKSPACE_ID,
          SESSION_ID,
          PRIOR_RESULT_ID,
          'preflight',
          'reviewed',
        ),
      ).resolves.toEqual(payload)

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        'acknowledge_inventory_migration_stage_attention',
        {
          p_workspace_id: WORKSPACE_ID,
          p_session_id: SESSION_ID,
          p_prior_result_id: PRIOR_RESULT_ID,
          p_next_step_name: 'preflight',
          p_note: 'reviewed',
        },
      )
    })

    it('forwards null note when omitted and does not infer next step', async () => {
      supabaseMocks.setRpcResult({ data: [], error: null })

      await acknowledgeInventoryMigrationStageAttention(
        WORKSPACE_ID,
        SESSION_ID,
        PRIOR_RESULT_ID,
        'phase1',
      )

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        'acknowledge_inventory_migration_stage_attention',
        {
          p_workspace_id: WORKSPACE_ID,
          p_session_id: SESSION_ID,
          p_prior_result_id: PRIOR_RESULT_ID,
          p_next_step_name: 'phase1',
          p_note: null,
        },
      )
    })

    it('propagates Supabase error without auto-creating acknowledgement', async () => {
      const rpcError = { message: 'inventory_migration_ack_prior_result_not_attention' }
      supabaseMocks.setRpcResult({ data: null, error: rpcError })

      await expect(
        acknowledgeInventoryMigrationStageAttention(
          WORKSPACE_ID,
          SESSION_ID,
          PRIOR_RESULT_ID,
          'phase2',
        ),
      ).rejects.toBe(rpcError)
      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
    })
  })

  describe('error propagation and no orchestration', () => {
    it('propagates Supabase error from start session', async () => {
      const rpcError = { message: 'inventory_migration_session_already_running' }
      supabaseMocks.setRpcResult({ data: null, error: rpcError })

      await expect(startInventoryMigrationSession(WORKSPACE_ID)).rejects.toBe(rpcError)
      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
    })

    it('requires ids without calling RPC', async () => {
      await expect(startInventoryMigrationSession('')).rejects.toThrow('Workspace ID is required.')
      await expect(
        cancelInventoryMigrationSession(WORKSPACE_ID, ''),
      ).rejects.toThrow('Session ID is required.')
      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('never chains a secondary RPC on success paths', async () => {
      supabaseMocks.setRpcResult({ data: STAGE_OUTCOME, error: null })

      await startInventoryMigrationSession(WORKSPACE_ID)
      await completeInventoryMigrationFoundationStep(WORKSPACE_ID, SESSION_ID)
      await runInventoryMigrationPersist(WORKSPACE_ID, SESSION_ID)
      await acknowledgeInventoryMigrationStageAttention(
        WORKSPACE_ID,
        SESSION_ID,
        PRIOR_RESULT_ID,
        'preflight',
      )

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(4)
      const names = supabaseMocks.rpc.mock.calls.map((call) => call[0])
      expect(names).toEqual([
        'start_inventory_migration_session',
        'transition_inventory_migration_step',
        'run_inventory_migration_persist',
        'acknowledge_inventory_migration_stage_attention',
      ])
    })
  })
})
