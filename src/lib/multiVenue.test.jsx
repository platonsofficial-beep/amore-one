/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return { container }
}

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: (...args) => rpcMock(...args), auth: { getSession: vi.fn() } },
}))

import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  getStoredActiveWorkspaceId,
  selectActiveMembershipRow,
  setStoredActiveWorkspaceId,
  summarizeMemberships,
} from '../services/membershipService'
import { buildCreateVenueParams, createVenue, formatCreateVenueError } from '../services/workspaceService'
import { pickWorkspaceProfileRecord } from '../services/workspaceProfileService'
import {
  NewVenueSheet,
  VenueManager,
  canCreateVenue,
  shouldShowVenueSwitcher,
} from '../components/workspace/VenueManager'

const rows = [
  { id: 'm1', workspace_id: 'ws-a', role: 'staff' },
  { id: 'm2', workspace_id: 'ws-b', role: 'owner' },
]

describe('active membership selection', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to role priority without a stored venue', () => {
    expect(selectActiveMembershipRow(rows, '').id).toBe('m2')
  })

  it('prefers the stored venue', () => {
    expect(selectActiveMembershipRow(rows, 'ws-a').id).toBe('m1')
  })

  it('ignores a stored venue the user no longer belongs to', () => {
    expect(selectActiveMembershipRow(rows, 'ws-gone').id).toBe('m2')
  })

  it('persists the active venue id in localStorage', () => {
    setStoredActiveWorkspaceId('ws-b')
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe('ws-b')
    expect(getStoredActiveWorkspaceId()).toBe('ws-b')
    setStoredActiveWorkspaceId('')
    expect(getStoredActiveWorkspaceId()).toBe('')
  })

  it('summarizes one entry per venue with names', () => {
    const list = summarizeMemberships(
      [...rows, { id: 'm3', workspace_id: 'ws-b', role: 'staff' }],
      [{ id: 'ws-a', name: 'Alpha' }, { id: 'ws-b', name: 'Beta' }],
    )
    expect(list).toEqual([
      { workspaceId: 'ws-a', workspaceName: 'Alpha', role: 'staff' },
      { workspaceId: 'ws-b', workspaceName: 'Beta', role: 'owner' },
    ])
  })
})

describe('createVenue', () => {
  beforeEach(() => rpcMock.mockReset())

  it('builds RPC params with defaults', () => {
    expect(buildCreateVenueParams({ name: ' X Bar ', countryCode: 'cy' })).toEqual({
      p_name: 'X Bar',
      p_timezone: 'Europe/Nicosia',
      p_currency: 'EUR',
      p_city: '',
      p_country_code: 'CY',
      p_country_name: '',
    })
  })

  it('calls create_workspace_venue and returns the id', async () => {
    rpcMock.mockResolvedValue({ data: 'ws-new', error: null })
    await expect(createVenue({ name: 'New Place' })).resolves.toBe('ws-new')
    expect(rpcMock).toHaveBeenCalledWith('create_workspace_venue', expect.objectContaining({ p_name: 'New Place' }))
  })

  it('maps RPC errors to Greek messages', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_allowed' } })
    await expect(createVenue({ name: 'New Place' })).rejects.toThrow(/ιδιοκτήτες/)
    expect(formatCreateVenueError({ message: 'invalid_timezone' })).toMatch(/ζώνη/)
  })

  it('rejects short names without calling the RPC', async () => {
    await expect(createVenue({ name: 'a' })).rejects.toThrow()
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('workspace profile record selection', () => {
  const legacy = { id: 1, workspace_key: 'default', workspace_id: 'ws-a' }
  const scoped = { id: 2, workspace_key: 'ws-b', workspace_id: 'ws-b' }

  it('uses the row of the active venue', () => {
    expect(pickWorkspaceProfileRecord([legacy, scoped], 'ws-b')).toBe(scoped)
    expect(pickWorkspaceProfileRecord([legacy, scoped], 'ws-a')).toBe(legacy)
  })

  it('does not leak another venue\'s legacy profile', () => {
    expect(pickWorkspaceProfileRecord([legacy], 'ws-c')).toBeNull()
  })

  it('keeps the default singleton when no venue id is known', () => {
    expect(pickWorkspaceProfileRecord([legacy, scoped], '')).toBe(legacy)
  })
})

describe('venue UI', () => {
  it('only owners and GMs can create venues', () => {
    expect(canCreateVenue('owner')).toBe(true)
    expect(canCreateVenue('general_manager')).toBe(true)
    expect(canCreateVenue('manager')).toBe(false)
    expect(canCreateVenue('staff')).toBe(false)
  })

  it('shows the switcher only with 2+ memberships', () => {
    expect(shouldShowVenueSwitcher([{}])).toBe(false)
    expect(shouldShowVenueSwitcher([{}, {}])).toBe(true)
  })

  it('renders the Greek new-venue sheet with defaults', () => {
    const { container } = render(<NewVenueSheet onClose={() => {}} />)
    expect(container.querySelector('[role="dialog"] h3').textContent).toBe('Νέο venue')
    const selects = container.querySelectorAll('select')
    expect(selects[0].value).toBe('Europe/Nicosia')
    expect(selects[1].value).toBe('EUR')
    expect(container.textContent).toContain('Ζώνη ώρας')
  })

  it('renders nothing outside AuthProvider for non-managers', () => {
    const { container } = render(<VenueManager />)
    expect(container.textContent).toBe('')
  })

  it('keeps the sheet inside the safe area with 44px controls', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/workspace/venueManager.css'), 'utf8')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('--one-safe-area-top')
    expect(css).toContain('--safe-l')
    expect(css).toContain('max-height: min(100%, 340px)')
    expect(css).toContain('calc(var(--safe-l, 0px) + 78px)')
  })
})
