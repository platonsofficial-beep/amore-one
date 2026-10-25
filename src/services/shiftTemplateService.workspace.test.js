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
  createShiftTemplate,
  getShiftTemplates,
  resetShiftTemplateWorkspaceColumnCacheForTests,
} from './shiftTemplateService'

const WORKSPACE_ID = '22222222-2222-2222-2222-222222222222'
const MISSING_COLUMN = {
  code: '42703',
  message: 'column shift_templates.workspace_id does not exist',
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
    maybeSingle: vi.fn(() => Promise.resolve(result)),
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

const templateRow = {
  id: 'tmpl-1',
  template_name: 'Dinner',
  start_time: '17:00',
  end_time: '23:00',
  default_role: 'server',
  default_area: 'floor',
  default_required_count: 2,
  is_active: true,
  sort_order: 1,
  notes: '',
  workspace_id: WORKSPACE_ID,
}

describe('shift template workspace scope', () => {
  beforeEach(() => {
    fromMock.mockReset()
    resetShiftTemplateWorkspaceColumnCacheForTests()
  })

  it('filters templates by workspace_id when the column is present', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: [templateRow], error: null },
    )

    const templates = await getShiftTemplates({ workspaceId: WORKSPACE_ID })

    expect(templates.map((template) => template.workspaceId)).toEqual([WORKSPACE_ID])
    expect(queries[0].eq).toHaveBeenCalledWith('workspace_id', NIL_WORKSPACE_ID)
    expect(queries[1].select).toHaveBeenCalledWith(expect.stringContaining('workspace_id'))
    expect(queries[1].eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
  })

  it('returns no templates when the column is present and no workspace is selected', async () => {
    const queries = queueResults({ data: [], error: null })

    await expect(getShiftTemplates()).resolves.toEqual([])
    expect(queries).toHaveLength(1)
  })

  it('reads without a workspace filter when the column is missing', async () => {
    const queries = queueResults(
      { data: null, error: MISSING_COLUMN },
      { data: [templateRow], error: null },
    )

    const templates = await getShiftTemplates({ workspaceId: WORKSPACE_ID })

    expect(templates).toHaveLength(1)
    expect(queries[1].select.mock.calls[0][0]).not.toContain('workspace_id')
    expect(queries[1].eq).not.toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
  })

  it('writes workspace_id on create when the column is present', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: templateRow, error: null },
    )

    const created = await createShiftTemplate({
      name: 'Dinner',
      startTime: '17:00',
      endTime: '23:00',
      sortOrder: 1,
      workspaceId: WORKSPACE_ID,
    })

    expect(created.workspaceId).toBe(WORKSPACE_ID)
    expect(queries[1].insert).toHaveBeenCalledWith([
      expect.objectContaining({ template_name: 'Dinner', workspace_id: WORKSPACE_ID }),
    ])
  })

  it('requires a workspace once the column is present', async () => {
    queueResults({ data: [], error: null })

    await expect(createShiftTemplate({
      name: 'Dinner',
      startTime: '17:00',
      endTime: '23:00',
      sortOrder: 1,
    })).rejects.toThrow('Workspace is required.')
  })

  it('strips workspace_id and retries when the column disappears on insert', async () => {
    const queries = queueResults(
      { data: [], error: null },
      { data: null, error: MISSING_COLUMN },
      { data: templateRow, error: null },
    )

    await createShiftTemplate({
      name: 'Dinner',
      startTime: '17:00',
      endTime: '23:00',
      sortOrder: 1,
      workspaceId: WORKSPACE_ID,
    })

    expect(queries[1].insert.mock.calls[0][0][0].workspace_id).toBe(WORKSPACE_ID)
    expect(queries[2].insert.mock.calls[0][0][0]).not.toHaveProperty('workspace_id')
  })
})
