import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}))

import * as workspaceStorageService from './workspaceStorageService'
import {
  WORKSPACE_STORAGE_LIST_COLUMNS,
  archiveWorkspaceStorage,
  createWorkspaceStorage,
  listWorkspaceStorages,
  mapWorkspaceStorage,
  normalizeWorkspaceStorageLocationKey,
} from './workspaceStorageService'

const HERE = dirname(fileURLToPath(import.meta.url))
const rpcSql = readFileSync(
  join(HERE, '../../supabase/workspace_storages_rpcs.sql'),
  'utf8',
)

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

describe('normalizeWorkspaceStorageLocationKey', () => {
  it('requires a non-empty trimmed key and rejects padding / overlength', () => {
    expect(() => normalizeWorkspaceStorageLocationKey('')).toThrow(
      'Storage location key is required.',
    )
    expect(() => normalizeWorkspaceStorageLocationKey('   ')).toThrow(
      'Storage location key is required.',
    )
    expect(() => normalizeWorkspaceStorageLocationKey(' Bar')).toThrow(
      'Storage location key cannot have leading or trailing spaces.',
    )
    expect(() => normalizeWorkspaceStorageLocationKey('x'.repeat(81))).toThrow(
      /80 characters or fewer/,
    )
    expect(normalizeWorkspaceStorageLocationKey('Bar')).toBe('Bar')
  })
})

describe('listWorkspaceStorages', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('requires workspaceId', async () => {
    await expect(listWorkspaceStorages('')).rejects.toThrow(
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
    fromMock.mockReturnValue(createListQuery({
      data: [{
        id: 'st-1',
        workspace_id: 'ws-1',
        location_key: 'Bar',
        name: 'Bar',
        active: true,
        sort_order: 0,
      }],
      error: null,
    }))

    await expect(listWorkspaceStorages('ws-1')).resolves.toEqual([{
      id: 'st-1',
      workspaceId: 'ws-1',
      locationKey: 'Bar',
      name: 'Bar',
      active: true,
      sortOrder: 0,
    }])
  })

  it('propagates Supabase errors', async () => {
    fromMock.mockReturnValue(createListQuery({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    }))

    await expect(listWorkspaceStorages('ws-1')).rejects.toThrow('permission denied')
  })
})

describe('createWorkspaceStorage', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('requires workspaceId and locationKey before RPC', async () => {
    await expect(createWorkspaceStorage('', 'Bar')).rejects.toThrow(
      'Workspace is required to create a storage.',
    )
    await expect(createWorkspaceStorage('ws-1', '')).rejects.toThrow(
      'Storage location key is required.',
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls create_workspace_storage manager RPC and maps the row', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'st-new',
        workspace_id: 'ws-1',
        location_key: 'Cellar',
        name: 'Cellar',
        active: true,
        sort_order: 3,
      },
      error: null,
    })

    await expect(createWorkspaceStorage('ws-1', 'Cellar')).resolves.toEqual({
      id: 'st-new',
      workspaceId: 'ws-1',
      locationKey: 'Cellar',
      name: 'Cellar',
      active: true,
      sortOrder: 3,
    })

    expect(rpcMock).toHaveBeenCalledWith('create_workspace_storage', {
      p_workspace_id: 'ws-1',
      p_location_key: 'Cellar',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('propagates duplicate errors from the RPC', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'workspace_storage_duplicate' },
    })

    await expect(createWorkspaceStorage('ws-1', 'Bar')).rejects.toThrow(
      'A storage with this name already exists in this workspace.',
    )
  })
})

describe('archiveWorkspaceStorage', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('requires workspaceId and storageId before RPC', async () => {
    await expect(archiveWorkspaceStorage('', 'st-1')).rejects.toThrow(
      'Workspace is required to archive a storage.',
    )
    await expect(archiveWorkspaceStorage('ws-1', '')).rejects.toThrow(
      'Storage is required to archive.',
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls archive_workspace_storage manager RPC and maps the row', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'st-1',
        workspace_id: 'ws-1',
        location_key: 'Bar',
        name: 'Bar',
        active: false,
        sort_order: 0,
      },
      error: null,
    })

    await expect(archiveWorkspaceStorage('ws-1', 'st-1')).resolves.toEqual({
      id: 'st-1',
      workspaceId: 'ws-1',
      locationKey: 'Bar',
      name: 'Bar',
      active: false,
      sortOrder: 0,
    })

    expect(rpcMock).toHaveBeenCalledWith('archive_workspace_storage', {
      p_workspace_id: 'ws-1',
      p_storage_id: 'st-1',
    })
  })

  it('propagates archive precondition errors', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'workspace_storage_blocked_active_items' },
    })
    await expect(archiveWorkspaceStorage('ws-1', 'st-1')).rejects.toThrow(
      /active products still use this location/,
    )

    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'workspace_storage_blocked_open_count' },
    })
    await expect(archiveWorkspaceStorage('ws-1', 'st-1')).rejects.toThrow(
      /open inventory count uses this location/,
    )
  })
})

describe('write surface + RPC SQL contract', () => {
  it('exports create/archive and does not export rename/delete/update', () => {
    expect(typeof workspaceStorageService.createWorkspaceStorage).toBe('function')
    expect(typeof workspaceStorageService.archiveWorkspaceStorage).toBe('function')
    expect(typeof workspaceStorageService.listWorkspaceStorages).toBe('function')
    expect(workspaceStorageService.renameWorkspaceStorage).toBeUndefined()
    expect(workspaceStorageService.deleteWorkspaceStorage).toBeUndefined()
    expect(workspaceStorageService.updateWorkspaceStorage).toBeUndefined()
  })

  it('defines create and archive RPCs with manager auth and archive guards', () => {
    expect(rpcSql).toContain('create or replace function public.create_workspace_storage')
    expect(rpcSql).toContain('create or replace function public.archive_workspace_storage')
    expect(rpcSql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(rpcSql).toContain("name == location_key")
    expect(rpcSql).toContain('workspace_storage_duplicate')
    expect(rpcSql).toContain('workspace_storage_blocked_active_items')
    expect(rpcSql).toContain('workspace_storage_blocked_open_count')
    expect(rpcSql).toContain("cs.status in ('in_progress', 'paused', 'counting_complete')")
    expect(rpcSql).toContain('si.active is true')
    expect(rpcSql).toContain('active = false')
    expect(rpcSql).not.toContain('rename_workspace_storage')
    expect(rpcSql).not.toContain('delete_workspace_storage')
    expect(rpcSql).toContain(
      'grant execute on function public.create_workspace_storage(uuid, text) to authenticated',
    )
    expect(rpcSql).toContain(
      'grant execute on function public.archive_workspace_storage(uuid, uuid) to authenticated',
    )
  })
})
