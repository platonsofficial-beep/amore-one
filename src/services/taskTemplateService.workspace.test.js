import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import {
  createTaskTemplate,
  getTaskTemplates,
  resetTaskTemplateWorkspaceColumnCacheForTests,
} from './taskTemplateService'

const WORKSPACE_ID = '33333333-3333-3333-3333-333333333333'
const MISSING_COLUMN = {
  code: '42703',
  message: 'column task_templates.workspace_id does not exist',
}

function chain(result) {
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
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
  fromMock.mockImplementation(() => {
    const result = results.shift() ?? { data: [], error: null }
    const query = chain(result)
    queries.push(query)
    return query
  })
  return queries
}

const templateRow = {
  id: 4,
  title: 'Open checks',
  department: 'customers',
  is_active: true,
  workspace_id: WORKSPACE_ID,
}

describe('task template workspace scope', () => {
  beforeEach(() => {
    fromMock.mockReset()
    resetTaskTemplateWorkspaceColumnCacheForTests()
  })

  it('filters templates by workspace when the column is present', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: [templateRow], error: null },
    )

    const templates = await getTaskTemplates(WORKSPACE_ID)

    expect(templates[0].workspaceId).toBe(WORKSPACE_ID)
    expect(queries[1].eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
  })

  it('returns none when the column is present and no workspace is selected', async () => {
    const queries = queueResults({ data: [], error: null })
    await expect(getTaskTemplates('')).resolves.toEqual([])
    expect(queries).toHaveLength(1)
  })

  it('writes workspace_id, and strips it if the column is missing on insert', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: null, error: MISSING_COLUMN },
      { data: templateRow, error: null },
    )

    await createTaskTemplate({
      title: 'Open checks',
      department: 'customers',
      workspaceId: WORKSPACE_ID,
    })

    expect(queries[1].insert.mock.calls[0][0][0].workspace_id).toBe(WORKSPACE_ID)
    expect(queries[2].insert.mock.calls[0][0][0]).not.toHaveProperty('workspace_id')
  })
})
