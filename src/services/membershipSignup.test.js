/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

import { createOwnerMembershipIfMissing } from './membershipService'

function memberQuery(rows) {
  return {
    select: () => ({
      eq: () => Promise.resolve({ data: rows, error: null }),
    }),
    insert: () => {
      throw new Error('signup must not insert a membership into an existing venue')
    },
  }
}

describe('createOwnerMembershipIfMissing', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
  })

  it('creates a new venue and does not claim the default workspace', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'workspace_members') return memberQuery([])
      throw new Error(`unexpected table ${table}`)
    })
    rpcMock.mockResolvedValue({ data: 'new-venue', error: null })

    const membership = await createOwnerMembershipIfMissing({
      id: 'user-1',
      email: 'ana@example.com',
      user_metadata: { full_name: 'Ana' },
    })

    expect(membership).toBeNull()
    expect(rpcMock).toHaveBeenCalledWith('create_signup_venue', {
      p_name: 'Ana',
      p_plan: 'start',
    })
    expect(fromMock.mock.calls.map((call) => call[0])).not.toContain('workspaces')
  })

  it('returns null when the signup function is not installed yet', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'workspace_members') return memberQuery([])
      throw new Error(`unexpected table ${table}`)
    })
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.create_signup_venue' },
    })

    await expect(createOwnerMembershipIfMissing({
      id: 'user-2',
      email: 'new@example.com',
    })).resolves.toBeNull()
  })

  it('keeps an existing membership and does not create a venue', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'workspace_members') {
        return memberQuery([{
          id: 'member-1',
          workspace_id: 'ws-1',
          auth_user_id: 'user-3',
          role: 'owner',
          display_name: 'Ana',
          email: 'ana@example.com',
        }])
      }
      if (table === 'workspaces') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'ws-1', name: 'Harbour', slug: 'harbour' },
                error: null,
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const membership = await createOwnerMembershipIfMissing({ id: 'user-3', email: 'ana@example.com' })
    expect(membership.workspaceId).toBe('ws-1')
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
