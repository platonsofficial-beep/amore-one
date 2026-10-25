import { describe, expect, it, vi } from 'vitest'
import {
  NIL_WORKSPACE_ID,
  createWorkspaceColumnProbe,
  isMissingWorkspaceIdColumnError,
  isTableMissingError,
  payloadWithoutWorkspaceId,
  readWorkspaceId,
} from './workspaceScopedTable'

function queryResult(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

describe('workspace column probe', () => {
  it('treats a missing workspace_id column as a column miss, not a missing table', () => {
    const error = { code: '42703', message: 'column tasks.workspace_id does not exist' }
    expect(isMissingWorkspaceIdColumnError(error)).toBe(true)
    expect(isTableMissingError(error)).toBe(false)
    expect(isTableMissingError({ message: 'relation "tasks" does not exist' })).toBe(true)
  })

  it('remembers a missing column and does not probe again', async () => {
    const missing = queryResult({
      data: null,
      error: { code: '42703', message: 'column shift_templates.workspace_id does not exist' },
    })
    const from = vi.fn(() => missing)
    const probe = createWorkspaceColumnProbe({ from }, 'shift_templates')

    await expect(probe.ensure()).resolves.toBe('missing')
    await expect(probe.ensure()).resolves.toBe('missing')
    expect(from).toHaveBeenCalledTimes(1)
    expect(missing.eq).toHaveBeenCalledWith('workspace_id', NIL_WORKSPACE_ID)
  })

  it('remembers a present column', async () => {
    const present = queryResult({ data: [], error: null })
    const from = vi.fn(() => present)
    const probe = createWorkspaceColumnProbe({ from }, 'tasks')
    await expect(probe.ensure()).resolves.toBe('present')
    await expect(probe.ensure()).resolves.toBe('present')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('strips workspace_id without dropping the rest of a payload', () => {
    expect(payloadWithoutWorkspaceId({ title: 'Close', workspace_id: 'ws-1' })).toEqual({ title: 'Close' })
    expect(readWorkspaceId({ workspaceId: 'ws-1' })).toBe('ws-1')
    expect(readWorkspaceId({})).toBe('')
  })
})
