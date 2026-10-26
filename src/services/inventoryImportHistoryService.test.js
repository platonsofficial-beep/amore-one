/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { fromMock, namesMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  namesMock: vi.fn(async () => ({ 'manager-1': 'Platon' })),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

vi.mock('./membershipService', () => ({
  getMemberDisplayNamesByAuthUserIds: (...args) => namesMock(...args),
}))

import { listRecentInventoryImportSessions } from './inventoryImportHistoryService'

function mockQuery(result) {
  const limit = vi.fn(async () => result)
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  fromMock.mockReturnValue({ select })
  return { select, eq, order, limit }
}

beforeEach(() => {
  fromMock.mockReset()
  namesMock.mockClear()
})

describe('listRecentInventoryImportSessions', () => {
  it('reads the latest sessions and does not write', async () => {
    const query = mockQuery({
      data: [{
        id: 'sess-1',
        workspace_id: 'ws-1',
        status: 'completed',
        source_filename: 'one-import-test.csv',
        created_by: 'starter',
        created_at: '2026-10-26T18:00:00.000Z',
        apply_completed_at: '2026-10-26T18:05:00.000Z',
        apply_result: {
          created_count: 2,
          linked_count: 1,
          operator_user_id: 'manager-1',
        },
      }],
      error: null,
    })

    const rows = await listRecentInventoryImportSessions({ workspaceId: 'ws-1' })

    expect(fromMock).toHaveBeenCalledWith('inventory_import_sessions')
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('apply_result'))
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(query.limit).toHaveBeenCalledWith(5)
    expect(namesMock).toHaveBeenCalledWith('ws-1', ['manager-1'])
    expect(rows[0]).toMatchObject({
      id: 'sess-1',
      actorName: 'Platon',
      createdCount: 2,
      linkedCount: 1,
      statusLabel: 'Completed',
    })

    const source = readFileSync(
      resolve(process.cwd(), 'src/services/inventoryImportHistoryService.js'),
      'utf8',
    )
    expect(source).not.toMatch(/\.insert\(/)
    expect(source).not.toMatch(/\.update\(/)
    expect(source).not.toMatch(/\.delete\(/)
    expect(source).not.toMatch(/\.rpc\(/)
  })
})
