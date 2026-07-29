/**
 * @vitest-environment node
 * P8.27.1 — Inventory Import Session Staging service wrappers.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: vi.fn(),
  },
}))

import * as inventoryImportService from './inventoryImportService'
import {
  CANCEL_INVENTORY_IMPORT_SESSION_RPC,
  CREATE_INVENTORY_IMPORT_SESSION_RPC,
  MARK_INVENTORY_IMPORT_SESSION_READY_RPC,
  STAGE_INVENTORY_IMPORT_ROWS_RPC,
  cancelInventoryImportSession,
  createInventoryImportSession,
  mapInventoryImportRpcError,
  mapInventoryImportSessionResult,
  markInventoryImportSessionReady,
  stageInventoryImportRows,
} from './inventoryImportService'

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVICE_SOURCE = readFileSync(
  join(HERE, 'inventoryImportService.js'),
  'utf8',
)

describe('mapInventoryImportSessionResult', () => {
  it('maps snake_case RPC payloads to camelCase', () => {
    expect(mapInventoryImportSessionResult({
      session_id: 'sess-1',
      workspace_id: 'ws-1',
      status: 'review',
      staged_row_count: 2,
      counters: {
        total_rows: 2,
        create_rows: 1,
        link_rows: 1,
        update_rows: 0,
        skip_rows: 0,
        valid_rows: 1,
        warning_rows: 1,
        error_rows: 0,
        manual_review_rows: 0,
      },
    })).toMatchObject({
      sessionId: 'sess-1',
      workspaceId: 'ws-1',
      status: 'review',
      stagedRowCount: 2,
      counters: {
        totalRows: 2,
        createRows: 1,
        linkRows: 1,
        updateRows: 0,
        skipRows: 0,
      },
    })
  })
})

describe('mapInventoryImportRpcError', () => {
  it('preserves useful server messages', () => {
    const error = mapInventoryImportRpcError(
      { message: 'inventory_import_session_forbidden' },
      'fallback',
    )
    expect(error.message).toBe('inventory_import_session_forbidden')
  })
})

describe('createInventoryImportSession', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('requires workspace and source filename', async () => {
    await expect(createInventoryImportSession({})).rejects.toThrow(/Workspace is required/)
    await expect(createInventoryImportSession({
      workspaceId: 'ws-1',
      sourceFilename: '  ',
    })).rejects.toThrow(/Source filename/)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls create RPC with snake_case parameters', async () => {
    rpcMock.mockResolvedValue({
      data: {
        session_id: 'sess-1',
        workspace_id: 'ws-1',
        status: 'draft',
        created_by: 'user-1',
      },
      error: null,
    })

    const result = await createInventoryImportSession({
      workspaceId: 'ws-1',
      sourceFilename: 'ops.xlsx',
      sourceFormat: 'xlsx',
      sourceFileSizeBytes: 100,
      sourceFingerprint: 'fp-1',
      selectedSheet: 'Sheet1',
      headerRowNumber: 2,
      parserVersion: 'operational_sheet_parser_v1',
      confirmations: { quantityPolicy: 'no_change' },
      stagingVersion: 'import_staging_payload_v1',
    })

    expect(rpcMock).toHaveBeenCalledWith(CREATE_INVENTORY_IMPORT_SESSION_RPC, {
      p_workspace_id: 'ws-1',
      p_source_filename: 'ops.xlsx',
      p_source_format: 'xlsx',
      p_source_file_size_bytes: 100,
      p_source_fingerprint: 'fp-1',
      p_selected_sheet: 'Sheet1',
      p_header_row_number: 2,
      p_parser_version: 'operational_sheet_parser_v1',
      p_normalization_version: null,
      p_validation_version: null,
      p_contract_version: 'import_v1.0',
      p_mapping: {},
      p_confirmations: { quantityPolicy: 'no_change' },
      p_source_metadata: {},
      p_staging_version: 'import_staging_payload_v1',
    })
    expect(result.sessionId).toBe('sess-1')
    expect(result.status).toBe('draft')
  })

  it('propagates Supabase errors', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'inventory_import_session_forbidden' },
    })
    await expect(createInventoryImportSession({
      workspaceId: 'ws-1',
      sourceFilename: 'ops.xlsx',
    })).rejects.toThrow('inventory_import_session_forbidden')
  })
})

describe('stageInventoryImportRows', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('requires workspace, session, and array rows', async () => {
    await expect(stageInventoryImportRows({
      workspaceId: '',
      sessionId: 'sess-1',
      rows: [],
    })).rejects.toThrow(/Workspace is required/)

    await expect(stageInventoryImportRows({
      workspaceId: 'ws-1',
      sessionId: '',
      rows: [],
    })).rejects.toThrow(/Import session is required/)

    await expect(stageInventoryImportRows({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      rows: null,
    })).rejects.toThrow(/must be an array/)

    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls stage RPC with workspace, session, and rows payload', async () => {
    rpcMock.mockResolvedValue({
      data: {
        session_id: 'sess-1',
        workspace_id: 'ws-1',
        status: 'review',
        staged_row_count: 1,
        counters: { total_rows: 1, create_rows: 1, link_rows: 0, update_rows: 0, skip_rows: 0 },
      },
      error: null,
    })

    const rows = [{
      source_row_number: 1,
      selected_action: 'create',
      validation_state: 'valid',
      conflict_state: 'none',
      apply_state: 'pending',
      raw_payload: {},
      normalized_payload: { name: 'X' },
      mapping_evidence: {},
    }]

    const result = await stageInventoryImportRows({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      rows,
    })

    expect(rpcMock).toHaveBeenCalledWith(STAGE_INVENTORY_IMPORT_ROWS_RPC, {
      p_workspace_id: 'ws-1',
      p_session_id: 'sess-1',
      p_rows: rows,
    })
    expect(result.status).toBe('review')
    expect(result.stagedRowCount).toBe(1)
    expect(result.counters.createRows).toBe(1)
  })
})

describe('cancelInventoryImportSession', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('requires workspace and session then calls cancel RPC', async () => {
    rpcMock.mockResolvedValue({
      data: {
        session_id: 'sess-1',
        workspace_id: 'ws-1',
        status: 'cancelled',
        cancelled_at: '2026-07-29T00:00:00Z',
        idempotent: false,
      },
      error: null,
    })

    const result = await cancelInventoryImportSession({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
    })

    expect(rpcMock).toHaveBeenCalledWith(CANCEL_INVENTORY_IMPORT_SESSION_RPC, {
      p_workspace_id: 'ws-1',
      p_session_id: 'sess-1',
    })
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2026-07-29T00:00:00Z')
  })
})

describe('markInventoryImportSessionReady', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('requires workspace and session', async () => {
    await expect(markInventoryImportSessionReady({
      workspaceId: '',
      sessionId: 'sess-1',
    })).rejects.toThrow(/Workspace is required/)

    await expect(markInventoryImportSessionReady({
      workspaceId: 'ws-1',
      sessionId: '',
    })).rejects.toThrow(/Import session is required/)

    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls ready RPC and maps status/counters/readyAt', async () => {
    rpcMock.mockResolvedValue({
      data: {
        session_id: 'sess-1',
        workspace_id: 'ws-1',
        status: 'ready',
        ready_at: '2026-07-29T12:00:00Z',
        quantity_policy: 'no_change',
        counters: {
          total_rows: 2,
          create_rows: 1,
          link_rows: 1,
          update_rows: 0,
          skip_rows: 0,
          valid_rows: 2,
          warning_rows: 0,
          error_rows: 0,
          manual_review_rows: 0,
        },
        updated_by: 'user-1',
      },
      error: null,
    })

    const result = await markInventoryImportSessionReady({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
    })

    expect(rpcMock).toHaveBeenCalledWith(MARK_INVENTORY_IMPORT_SESSION_READY_RPC, {
      p_workspace_id: 'ws-1',
      p_session_id: 'sess-1',
    })
    expect(result.status).toBe('ready')
    expect(result.readyAt).toBe('2026-07-29T12:00:00Z')
    expect(result.quantityPolicy).toBe('no_change')
    expect(result.counters.createRows).toBe(1)
    expect(result.counters.linkRows).toBe(1)
  })

  it('propagates Supabase errors', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'inventory_import_ready_unresolved_row' },
    })
    await expect(markInventoryImportSessionReady({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
    })).rejects.toThrow('inventory_import_ready_unresolved_row')
  })
})

describe('service scope guards', () => {
  it('exports Ready wrapper but not Apply, and does not use direct table inserts', () => {
    expect(inventoryImportService).toHaveProperty('markInventoryImportSessionReady')
    expect(inventoryImportService).not.toHaveProperty('applyInventoryImport')
    expect(inventoryImportService).not.toHaveProperty('apply')
    expect(SERVICE_SOURCE).not.toMatch(/\.from\(['"]inventory_import_/)
    expect(SERVICE_SOURCE).not.toMatch(/\.insert\(/)
    expect(SERVICE_SOURCE).toContain('supabase.rpc')
    expect(SERVICE_SOURCE).toContain('mark_inventory_import_session_ready')
  })
})
