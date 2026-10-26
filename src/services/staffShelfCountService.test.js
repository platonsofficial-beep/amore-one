import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}))

import {
  isStaffShelfCountRpcMissing,
  mapStaffShelfCountError,
  staffShelfCountAvailable,
  submitStaffShelfCount,
} from './staffShelfCountService'

describe('submitStaffShelfCount', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('treats a missing function as unavailable and does not save', async () => {
    expect(isStaffShelfCountRpcMissing({
      code: 'PGRST202',
      message: 'Could not find the function submit_staff_shelf_count',
    })).toBe(true)
    expect(mapStaffShelfCountError({ message: 'staff_shelf_count_already_waiting' }).message)
      .toMatch(/waiting for a manager/i)

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function submit_staff_shelf_count' },
    })
    await expect(staffShelfCountAvailable()).resolves.toBe(false)

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function submit_staff_shelf_count' },
    })
    await expect(submitStaffShelfCount({
      workspaceId: 'ws-1',
      workspaceStorageId: 'shelf-1',
      lines: [{ stock_item_id: 'cola', counted_quantity: 2 }],
    })).rejects.toThrow(/not available yet/i)
  })

  it('submits quantities only and returns the session id', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'staff_shelf_count_workspace_required' },
    })
    await expect(staffShelfCountAvailable()).resolves.toBe(true)

    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        session_id: 'session-1',
        storage_name: 'Back bar',
        line_count: 1,
        status: 'counting_complete',
        submitted_at: '2026-10-26T12:00:00.000Z',
        cost_price: 12,
      },
      error: null,
    })

    await expect(submitStaffShelfCount({
      workspaceId: 'ws-1',
      workspaceStorageId: 'shelf-1',
      lines: [{ stock_item_id: 'cola', counted_quantity: 2 }],
    })).resolves.toEqual({
      sessionId: 'session-1',
      storageName: 'Back bar',
      lineCount: 1,
      status: 'counting_complete',
      submittedAt: '2026-10-26T12:00:00.000Z',
    })

    expect(rpcMock).toHaveBeenLastCalledWith('submit_staff_shelf_count', {
      p_workspace_id: 'ws-1',
      p_workspace_storage_id: 'shelf-1',
      p_lines: [{ stock_item_id: 'cola', counted_quantity: 2 }],
    })
  })
})
