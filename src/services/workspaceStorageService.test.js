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
  WORKSPACE_STORAGE_RECEIVE_COLUMNS,
  WORKSPACE_STORAGE_DUPLICATE_NAME_MESSAGE,
  WORKSPACE_STORAGE_RENAME_UNAVAILABLE_MESSAGE,
  archiveWorkspaceStorage,
  createWorkspaceStorage,
  listReceiveDestinationStorages,
  listWorkspaceStorages,
  mapWorkspaceStorage,
  normalizeWorkspaceStorageDisplayName,
  normalizeWorkspaceStorageLocationKey,
  renameWorkspaceStorage,
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

  it('carries department and supply fields only when the row includes them', () => {
    expect(mapWorkspaceStorage({
      id: 'st-2',
      workspace_id: 'ws-1',
      location_key: 'Soft drinks',
      name: 'Soft drinks',
      active: true,
      sort_order: 1,
      department_id: null,
      is_supply: true,
    })).toMatchObject({
      locationKey: 'Soft drinks',
      departmentId: null,
      isSupply: true,
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

describe('listReceiveDestinationStorages', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('includes is_supply and maps the supply flag', async () => {
    const query = createListQuery({
      data: [{
        id: 'cellar',
        workspace_id: 'ws-1',
        location_key: 'Cellar',
        name: 'Cellar',
        active: true,
        sort_order: 1,
        is_supply: true,
      }],
      error: null,
    })
    fromMock.mockReturnValue(query)

    await expect(listReceiveDestinationStorages('ws-1')).resolves.toEqual([{
      id: 'cellar',
      workspaceId: 'ws-1',
      locationKey: 'Cellar',
      name: 'Cellar',
      active: true,
      sortOrder: 1,
      isSupply: true,
    }])
    expect(query.select).toHaveBeenCalledWith(WORKSPACE_STORAGE_RECEIVE_COLUMNS)
  })

  it('falls back to the base storage columns when is_supply is not in the schema', async () => {
    const missing = createListQuery({
      data: null,
      error: { message: 'column workspace_storages.is_supply does not exist', code: '42703' },
    })
    const fallback = createListQuery({
      data: [{
        id: 'bar',
        workspace_id: 'ws-1',
        location_key: 'Bar',
        name: 'Bar',
        active: true,
        sort_order: 0,
      }],
      error: null,
    })
    fromMock.mockReturnValueOnce(missing).mockReturnValueOnce(fallback)

    await expect(listReceiveDestinationStorages('ws-1')).resolves.toEqual([{
      id: 'bar',
      workspaceId: 'ws-1',
      locationKey: 'Bar',
      name: 'Bar',
      active: true,
      sortOrder: 0,
    }])
    expect(missing.select).toHaveBeenCalledWith(WORKSPACE_STORAGE_RECEIVE_COLUMNS)
    expect(fallback.select).toHaveBeenCalledWith(WORKSPACE_STORAGE_LIST_COLUMNS)
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

describe('normalizeWorkspaceStorageDisplayName', () => {
  it('trims a display name and rejects blank or overlong names', () => {
    expect(normalizeWorkspaceStorageDisplayName('  Cellar  ')).toBe('Cellar')
    expect(() => normalizeWorkspaceStorageDisplayName('   ')).toThrow('Storage name is required.')
    expect(() => normalizeWorkspaceStorageDisplayName('x'.repeat(81))).toThrow(/80 characters or fewer/)
  })
})

describe('renameWorkspaceStorage', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  function createUpdateQuery(result) {
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
    }
    return query
  }

  it('updates only the display name and keeps the returned location key', async () => {
    const query = createUpdateQuery({
      data: {
        id: 'st-1',
        workspace_id: 'ws-1',
        location_key: 'Main Storage',
        name: 'Cellar',
        active: true,
        sort_order: 1,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await expect(renameWorkspaceStorage('ws-1', 'st-1', '  Cellar  ')).resolves.toEqual({
      id: 'st-1',
      workspaceId: 'ws-1',
      locationKey: 'Main Storage',
      name: 'Cellar',
      active: true,
      sortOrder: 1,
    })

    expect(fromMock).toHaveBeenCalledWith('workspace_storages')
    expect(query.update).toHaveBeenCalledWith({ name: 'Cellar' })
    expect(JSON.stringify(query.update.mock.calls)).not.toMatch(/location_key/)
    expect(query.eq).toHaveBeenNthCalledWith(1, 'workspace_id', 'ws-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'id', 'st-1')
    expect(query.select).toHaveBeenCalledWith(WORKSPACE_STORAGE_LIST_COLUMNS)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('keeps the duplicate-name check', async () => {
    fromMock.mockReturnValue(createUpdateQuery({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "workspace_storages_workspace_name_normalized_uidx"',
      },
    }))

    await expect(renameWorkspaceStorage('ws-1', 'st-1', 'Bar')).rejects.toThrow(
      WORKSPACE_STORAGE_DUPLICATE_NAME_MESSAGE,
    )
  })

  it('explains the unapplied name = location_key check', async () => {
    fromMock.mockReturnValue(createUpdateQuery({
      data: null,
      error: {
        code: '23514',
        message: 'new row for relation "workspace_storages" violates check constraint "workspace_storages_name_equals_location_key_chk"',
      },
    }))

    await expect(renameWorkspaceStorage('ws-1', 'st-1', 'Cellar')).rejects.toThrow(
      WORKSPACE_STORAGE_RENAME_UNAVAILABLE_MESSAGE,
    )
  })

  it('requires a workspace and a storage before writing', async () => {
    await expect(renameWorkspaceStorage('', 'st-1', 'Cellar')).rejects.toThrow(
      'Workspace is required to rename a storage.',
    )
    await expect(renameWorkspaceStorage('ws-1', '', 'Cellar')).rejects.toThrow(
      'Storage is required to rename.',
    )
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('write surface + RPC SQL contract', () => {
  it('exports create, archive, and display-name rename, and does not export delete', () => {
    expect(typeof workspaceStorageService.createWorkspaceStorage).toBe('function')
    expect(typeof workspaceStorageService.archiveWorkspaceStorage).toBe('function')
    expect(typeof workspaceStorageService.renameWorkspaceStorage).toBe('function')
    expect(typeof workspaceStorageService.listWorkspaceStorages).toBe('function')
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
