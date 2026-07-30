import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveStorageFastCountLocationKey,
  startStorageFastCountSession,
} from './stockStorageFastCountService.js'

describe('stockStorageFastCountService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves locationKey for Inventory Count (not storage id)', () => {
    expect(resolveStorageFastCountLocationKey({
      id: 'uuid-1',
      locationKey: 'Main Storage',
      name: 'Main Storage',
    })).toBe('Main Storage')
    expect(resolveStorageFastCountLocationKey({
      id: 'uuid-1',
      location_key: 'Bar',
    })).toBe('Bar')
  })

  it('starts a normal Inventory Count session for exactly one storage', async () => {
    const createSessionWithSnapshot = vi.fn(async () => ({
      session: { id: 'sess-1', workspaceId: 'ws-1', status: 'in_progress' },
      snapshot: { sessionId: 'sess-1', itemsCreated: 3, snapshotCreatedAt: '2026-07-30T00:00:00Z' },
    }))

    const result = await startStorageFastCountSession({
      workspaceId: 'ws-1',
      storage: { id: 'storage-uuid', locationKey: 'Main Storage', name: 'Main Storage' },
      createSessionWithSnapshot,
    })

    expect(createSessionWithSnapshot).toHaveBeenCalledTimes(1)
    expect(createSessionWithSnapshot).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      countType: 'partial',
      visibility: 'blind',
      includeZeroStock: true,
      includeInactive: false,
      note: '',
      locations: ['Main Storage'],
    })
    expect(result.session.id).toBe('sess-1')
    expect(result.locationKey).toBe('Main Storage')
  })

  it('rejects missing workspace or location without calling create', async () => {
    const createSessionWithSnapshot = vi.fn()
    await expect(startStorageFastCountSession({
      workspaceId: '',
      storage: { locationKey: 'Bar' },
      createSessionWithSnapshot,
    })).rejects.toThrow(/Workspace is required/i)
    await expect(startStorageFastCountSession({
      workspaceId: 'ws-1',
      storage: { id: 'only-id' },
      createSessionWithSnapshot,
    })).rejects.toThrow(/Storage location is required/i)
    expect(createSessionWithSnapshot).not.toHaveBeenCalled()
  })

  it('preserves exact location key characters for snapshot matching', async () => {
    const createSessionWithSnapshot = vi.fn(async () => ({
      session: { id: 'sess-2' },
      snapshot: { sessionId: 'sess-2', itemsCreated: 1 },
    }))

    await startStorageFastCountSession({
      workspaceId: 'ws-1',
      storage: { locationKey: '  Padded Bay  ' },
      createSessionWithSnapshot,
    })

    expect(createSessionWithSnapshot.mock.calls[0][0].locations).toEqual(['  Padded Bay  '])
  })
})
