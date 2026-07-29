import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import * as workspaceStorageService from './workspaceStorageService'
import {
  WORKSPACE_STORAGE_LIST_COLUMNS,
  listWorkspaceStorages,
  mapWorkspaceStorage,
} from './workspaceStorageService'

function createListQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return query
}

describe('mapWorkspaceStorage', () => {
  it('maps snake_case rows to the read contract', () => {
    expect(mapWorkspaceStorage({
      id: 'st-1',
      workspace_id: 'ws-1',
      location_key: 'Bar',
      name: 'Bar',
      active: true,
      sort_order: 2,
      name_normalized: 'bar',
      created_by: 'user-1',
    })).toEqual({
      id: 'st-1',
      workspaceId: 'ws-1',
      locationKey: 'Bar',
      name: 'Bar',
      active: true,
      sortOrder: 2,
    })
  })
})

describe('listWorkspaceStorages', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('requires workspaceId', async () => {
    await expect(listWorkspaceStorages('')).rejects.toThrow(
      'Workspace is required to load storages.',
    )
    await expect(listWorkspaceStorages('   ')).rejects.toThrow(
      'Workspace is required to load storages.',
    )
    await expect(listWorkspaceStorages(null)).rejects.toThrow(
      'Workspace is required to load storages.',
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('queries active storages ordered by sort_order then name', async () => {
    const query = createListQuery({ data: [], error: null })
    fromMock.mockReturnValue(query)

    await listWorkspaceStorages('ws-1')

    expect(fromMock).toHaveBeenCalledWith('workspace_storages')
    expect(query.select).toHaveBeenCalledWith(WORKSPACE_STORAGE_LIST_COLUMNS)
    expect(query.eq).toHaveBeenNthCalledWith(1, 'workspace_id', 'ws-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'active', true)
    expect(query.order).toHaveBeenNthCalledWith(1, 'sort_order', { ascending: true })
    expect(query.order).toHaveBeenNthCalledWith(2, 'name', { ascending: true })
  })

  it('returns mapped storage objects', async () => {
    const query = createListQuery({
      data: [
        {
          id: 'st-1',
          workspace_id: 'ws-1',
          location_key: 'Bar',
          name: 'Bar',
          active: true,
          sort_order: 0,
        },
        {
          id: 'st-2',
          workspace_id: 'ws-1',
          location_key: 'Kitchen',
          name: 'Kitchen',
          active: true,
          sort_order: 1,
        },
      ],
      error: null,
    })
    fromMock.mockReturnValue(query)

    await expect(listWorkspaceStorages('ws-1')).resolves.toEqual([
      {
        id: 'st-1',
        workspaceId: 'ws-1',
        locationKey: 'Bar',
        name: 'Bar',
        active: true,
        sortOrder: 0,
      },
      {
        id: 'st-2',
        workspaceId: 'ws-1',
        locationKey: 'Kitchen',
        name: 'Kitchen',
        active: true,
        sortOrder: 1,
      },
    ])
  })

  it('propagates Supabase errors', async () => {
    fromMock.mockReturnValue(createListQuery({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    }))

    await expect(listWorkspaceStorages('ws-1')).rejects.toThrow('permission denied')
  })

  it('returns an empty array when there are no active storages', async () => {
    fromMock.mockReturnValue(createListQuery({ data: [], error: null }))
    await expect(listWorkspaceStorages('ws-empty')).resolves.toEqual([])
  })

  it('does not export write methods', () => {
    expect(workspaceStorageService.createWorkspaceStorage).toBeUndefined()
    expect(workspaceStorageService.archiveWorkspaceStorage).toBeUndefined()
    expect(workspaceStorageService.renameWorkspaceStorage).toBeUndefined()
    expect(workspaceStorageService.deleteWorkspaceStorage).toBeUndefined()
    expect(workspaceStorageService.updateWorkspaceStorage).toBeUndefined()
    expect(typeof workspaceStorageService.listWorkspaceStorages).toBe('function')
  })
})
