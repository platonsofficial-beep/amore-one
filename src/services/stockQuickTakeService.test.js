import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))

const { takeStockFromStorage, undoQuickTake, quickTakeAvailable, QuickTakeUnavailableError } = await import('./stockQuickTakeService')

describe('stockQuickTakeService', () => {
  beforeEach(() => rpc.mockReset())
  it('sends the base quantity with an idempotency key', async () => {
    rpc.mockResolvedValue({ data: [{ movement_id: 'mv1', quantity_after: 18 }], error: null })
    const result = await takeStockFromStorage({ workspaceId: 'w', storageId: 's', stockItemId: 'i', quantity: 30, idempotencyKey: 'k1' })
    expect(rpc).toHaveBeenCalledWith('take_stock_from_storage', expect.objectContaining({ p_quantity: 30, p_idempotency_key: 'k1', p_workspace_storage_id: 's' }))
    expect(result.movementId).toBe('mv1')
    expect(result.quantityAfter).toBe(18)
  })
  it('turns a missing function into a clear unavailable error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(takeStockFromStorage({ workspaceId: 'w', storageId: 's', stockItemId: 'i', quantity: 1 })).rejects.toBeInstanceOf(QuickTakeUnavailableError)
    expect(await quickTakeAvailable()).toBe(false)
  })
  it('maps an open count to a plain message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'quick_take_count_open' } })
    await expect(takeStockFromStorage({ workspaceId: 'w', storageId: 's', stockItemId: 'i', quantity: 1 })).rejects.toThrow('A count is open')
  })
  it('rejects zero quantity without calling the server', async () => {
    await expect(takeStockFromStorage({ workspaceId: 'w', storageId: 's', stockItemId: 'i', quantity: 0 })).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('undo calls the undo function', async () => {
    rpc.mockResolvedValue({ data: { quantity_after: 48 }, error: null })
    expect((await undoQuickTake('mv1')).quantityAfter).toBe(48)
    expect(rpc).toHaveBeenCalledWith('undo_quick_take', { p_movement_id: 'mv1' })
  })
  it('treats other probe errors as available', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'quick_take_quantity_invalid' } })
    expect(await quickTakeAvailable()).toBe(true)
  })
})

describe('quick take error reason (2026-11-05 fix)', () => {
  it('keeps a short real reason and shows it only to managers', async () => {
    const { mapQuickTakeError, quickTakeErrorText } = await import('./stockQuickTakeService')
    const err = mapQuickTakeError({ code: '42703', message: 'record "v_storage" has no field "is_active"' })
    expect(err.message).not.toMatch(/connection/i)
    expect(quickTakeErrorText(err, { canManage: false })).toBe(err.message)
    expect(quickTakeErrorText(err, { canManage: true })).toContain('42703 · record "v_storage" has no field "is_active"')
  })
})
