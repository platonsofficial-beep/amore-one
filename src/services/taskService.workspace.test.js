import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import { NIL_WORKSPACE_ID } from '../lib/workspaceScopedTable'
import {
  createTask,
  getTasks,
  resetTaskWorkspaceColumnCacheForTests,
} from './taskService'

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'
const MISSING_COLUMN = {
  code: '42703',
  message: 'column tasks.workspace_id does not exist',
}

function chain(result) {
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

function queueResults(...results) {
  const queries = []
  fromMock.mockImplementation((table) => {
    const result = results.shift() ?? { data: [], error: null }
    const query = chain(result)
    query.table = table
    queries.push(query)
    return query
  })
  return queries
}

const taskRow = {
  id: 7,
  title: 'Close bar',
  department: 'customers',
  due_date: '2026-10-25',
  status: 'active',
  workspace_id: WORKSPACE_ID,
}

describe('task workspace scope', () => {
  beforeEach(() => {
    fromMock.mockReset()
    resetTaskWorkspaceColumnCacheForTests()
  })

  it('filters tasks by workspace_id when the column is present', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: [taskRow], error: null },
    )

    const tasks = await getTasks(WORKSPACE_ID)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].workspaceId).toBe(WORKSPACE_ID)
    expect(queries[0].eq).toHaveBeenCalledWith('workspace_id', NIL_WORKSPACE_ID)
    expect(queries[1].eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
  })

  it('returns no tasks when the column is present and no workspace is selected', async () => {
    const queries = queueResults({ data: [], error: null })

    await expect(getTasks('')).resolves.toEqual([])
    expect(queries).toHaveLength(1)
  })

  it('lists without a workspace filter when the column is missing', async () => {
    const queries = queueResults(
      { data: null, error: MISSING_COLUMN },
      { data: [taskRow], error: null },
    )

    const tasks = await getTasks(WORKSPACE_ID)

    expect(tasks).toHaveLength(1)
    expect(queries[1].eq).not.toHaveBeenCalled()
  })

  it('retries an unscoped read when the column disappears after the probe', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: null, error: MISSING_COLUMN },
      { data: [taskRow], error: null },
    )

    const tasks = await getTasks(WORKSPACE_ID)

    expect(tasks).toHaveLength(1)
    expect(queries[1].eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
    expect(queries[2].eq).not.toHaveBeenCalled()
  })

  it('writes workspace_id when the column is present', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: taskRow, error: null },
    )

    const created = await createTask({
      title: 'Close bar',
      department: 'customers',
      dueDate: '2026-10-25',
      workspaceId: WORKSPACE_ID,
    })

    expect(created.workspaceId).toBe(WORKSPACE_ID)
    expect(queries[1].insert).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Close bar', workspace_id: WORKSPACE_ID }),
    ])
  })

  it('requires a workspace once the column is present', async () => {
    queueResults({ data: [], error: null })

    await expect(createTask({
      title: 'Close bar',
      department: 'customers',
      dueDate: '2026-10-25',
    })).rejects.toThrow('Workspace is required.')
  })

  it('omits workspace_id and retries when the column is missing', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: null, error: MISSING_COLUMN },
      { data: taskRow, error: null },
    )

    await createTask({
      title: 'Close bar',
      department: 'customers',
      dueDate: '2026-10-25',
      workspaceId: WORKSPACE_ID,
    })

    const firstPayload = queries[1].insert.mock.calls[0][0][0]
    const retryPayload = queries[2].insert.mock.calls[0][0][0]
    expect(firstPayload.workspace_id).toBe(WORKSPACE_ID)
    expect(retryPayload).not.toHaveProperty('workspace_id')
    expect(retryPayload.title).toBe('Close bar')
  })
})
