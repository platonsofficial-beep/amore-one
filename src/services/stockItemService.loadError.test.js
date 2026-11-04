/**
 * Stock audit S-01 — a failed catalog read must be distinguishable from an empty catalog.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}))
vi.mock('./supplierService', () => ({ getSuppliers: vi.fn(async () => []) }))

import { getStockItems } from './stockItemService'

function selectQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

describe('getStockItems load errors (S-01)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('keeps returning [] on error by default (background refresh callers)', async () => {
    fromMock.mockReturnValue(selectQuery({ data: null, error: { message: 'boom', code: '500' } }))
    await expect(getStockItems('ws-1')).resolves.toEqual([])
  })

  it('throws on error when throwOnError is set (initial catalog load)', async () => {
    fromMock.mockReturnValue(selectQuery({ data: null, error: { message: 'boom', code: '500' } }))
    await expect(getStockItems('ws-1', { throwOnError: true })).rejects.toThrow('boom')
  })

  it('still returns [] for a missing table even with throwOnError', async () => {
    fromMock.mockReturnValue(selectQuery({ data: null, error: { message: 'relation "public.stock_items" does not exist', code: '42P01' } }))
    await expect(getStockItems('ws-1', { throwOnError: true })).resolves.toEqual([])
  })

  it('returns rows normally with throwOnError', async () => {
    fromMock.mockReturnValue(selectQuery({ data: [{ id: 'a', workspace_id: 'ws-1', name: 'Gin', active: true }], error: null }))
    const items = await getStockItems('ws-1', { throwOnError: true })
    expect(items).toHaveLength(1)
  })
})
