import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}))

import {
  clearMemberDisplayNameCache,
  getMemberDisplayNamesByAuthUserIds,
  invalidateMemberDisplayNames,
} from './membershipService'

function memberQuery(rows) {
  const api = {
    select() { return api },
    eq() { return api },
    in() { return api },
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
    },
  }
  return api
}

describe('member display name cache', () => {
  beforeEach(() => {
    fromMock.mockReset()
    clearMemberDisplayNameCache()
  })

  it('looks up the same people once per session', async () => {
    fromMock.mockImplementation(() => memberQuery([
      { auth_user_id: 'user-1', display_name: 'Ada', email: 'ada@example.com' },
      { auth_user_id: 'user-2', display_name: '', email: 'bea@example.com' },
    ]))

    const first = await getMemberDisplayNamesByAuthUserIds('ws-1', ['user-1', 'user-2', 'user-1'])
    const second = await getMemberDisplayNamesByAuthUserIds('ws-1', ['user-2', 'user-1'])

    expect(first).toEqual({ 'user-1': 'Ada', 'user-2': 'bea' })
    expect(second).toEqual(first)
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('fetches again after a member change drops that name', async () => {
    fromMock.mockImplementation(() => memberQuery([
      { auth_user_id: 'user-1', display_name: 'Ada', email: 'ada@example.com' },
    ]))
    await getMemberDisplayNamesByAuthUserIds('ws-1', ['user-1'])
    invalidateMemberDisplayNames('ws-1', 'user-1')
    fromMock.mockImplementation(() => memberQuery([
      { auth_user_id: 'user-1', display_name: 'Ada Lovelace', email: 'ada@example.com' },
    ]))

    const next = await getMemberDisplayNamesByAuthUserIds('ws-1', ['user-1'])
    expect(next['user-1']).toBe('Ada Lovelace')
    expect(fromMock).toHaveBeenCalledTimes(2)
  })
})
