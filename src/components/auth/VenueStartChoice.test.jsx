/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const authState = { current: {} }
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authState.current,
}))
vi.mock('../../services/inviteService', () => ({ getInvitePreview: vi.fn() }))
vi.mock('../../legal/LegalAcceptanceGate', () => ({
  LegalAcceptanceGate: ({ children }) => children,
}))

import { AuthGate } from './AuthGate'
import { VenueStartChoice } from './VenueStartChoice'

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

function render(node) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(node))
}

describe('venue start choice', () => {
  it('offers create or invite when a signed-in account has no venue and no invite', () => {
    authState.current = {
      session: { user: { id: 'u', email: 'new@example.com' } },
      isBootstrapping: false,
      isLoading: false,
      isJoiningWorkspace: false,
      venueWaitLabel: '',
      isAuthDisabled: false,
      membership: null,
      membershipLoadError: null,
      signOut: vi.fn(),
      startOwnVenue: vi.fn(),
      joinVenueWithInvite: vi.fn(),
    }
    window.localStorage.clear()
    window.sessionStorage.clear()

    render(createElement(AuthGate, null, 'the-app'))

    expect(container.textContent).toContain('How do you want to start?')
    expect(container.textContent).toContain('Create my own venue')
    expect(container.textContent).toContain('I have an invite')
    expect(container.textContent).not.toContain('the-app')
    expect(container.textContent).not.toContain("Couldn't load")
  })

  it('keeps a pending invite on the joining screen instead of the choice', () => {
    window.localStorage.setItem('one.pendingInviteToken.local', 'from-the-link')
    authState.current = {
      session: { user: { id: 'u' } },
      isBootstrapping: false,
      isLoading: false,
      isJoiningWorkspace: false,
      venueWaitLabel: '',
      isAuthDisabled: false,
      membership: null,
      membershipLoadError: null,
      signOut: vi.fn(),
    }

    render(createElement(AuthGate, null, 'the-app'))
    expect(container.textContent).toContain('Joining your venue')
    expect(container.textContent).not.toContain('How do you want to start?')
    window.localStorage.clear()
  })

  it('keeps an account that already belongs to a venue in the app', () => {
    authState.current = {
      session: { user: { id: 'u' } },
      isBootstrapping: false,
      isLoading: false,
      isJoiningWorkspace: false,
      venueWaitLabel: '',
      isAuthDisabled: false,
      membership: { id: 'm', workspaceId: 'ws' },
      membershipLoadError: null,
      signOut: vi.fn(),
    }

    render(createElement(AuthGate, null, 'the-app'))
    expect(container.textContent).toBe('the-app')
  })

  it('creates a venue or shows the invite error without leaving the choice screen', async () => {
    const startOwnVenue = vi.fn(async () => {})
    const joinVenueWithInvite = vi.fn(async () => {
      throw new Error('This invite has expired. Ask your manager to send a new invite link.')
    })
    authState.current = {
      startOwnVenue,
      joinVenueWithInvite,
      signOut: vi.fn(),
    }

    render(createElement(VenueStartChoice))
    function clickButton(label) {
      const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
      button.click()
    }
    await act(async () => {
      clickButton('Create my own venue')
    })
    expect(startOwnVenue).toHaveBeenCalled()

    act(() => {
      clickButton('I have an invite')
    })
    expect(container.textContent).toContain('Paste the link you received to join the venue.')
    expect(container.textContent).toContain('Invite link')
    expect(container.textContent).not.toContain('Paste your invite link')
    expect(container.textContent.toLowerCase()).not.toContain('code')
    expect(container.querySelector('#venue-start-invite').getAttribute('placeholder')).toBe('https://app.onehospitality.app/...')
    expect(container.querySelector('.auth-page').className).toContain('is-venue-start')
    const input = container.querySelector('#venue-start-invite')
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      valueSetter.call(input, 'https://app.onehospitality.app/?invite=old')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const form = container.querySelector('form')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(joinVenueWithInvite).toHaveBeenCalledWith('https://app.onehospitality.app/?invite=old')
    expect(container.textContent).toContain('expired')
  })
})
