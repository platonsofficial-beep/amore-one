/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const auth = {
  user: { id: 'user-1', email: 'owner@venue.test' },
  workspace: { id: 'venue-1' },
  membership: { workspaceId: 'venue-1', role: 'owner' },
  role: 'owner',
  signOut: vi.fn(),
}

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../components/brand/OneFullLogo', () => ({ OneFullLogo: () => null }))
vi.mock('../lib/supabaseClient', () => ({ supabase: null }))

const { LegalAcceptanceGate } = await import('./LegalAcceptanceGate')
const { ACCEPTANCE_STORAGE_KEY } = await import('./acceptance')
const { LEGAL_BUNDLE } = await import('./provider')

afterEach(() => {
  localStorage.removeItem(ACCEPTANCE_STORAGE_KEY)
  auth.role = 'owner'
  auth.membership.role = 'owner'
})

function renderGate() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(LegalAcceptanceGate, null, createElement('p', { className: 'app-body' }, 'the app')))
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('LegalAcceptanceGate', () => {
  it('blocks the app until the documents are accepted', async () => {
    const view = renderGate()
    await flush()
    const accept = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Accept')
    expect(accept.disabled).toBe(true)
    expect(document.body.textContent).not.toContain('the app')
    const box = document.body.querySelector('input[type="checkbox"]')
    act(() => { box.click() })
    expect(accept.disabled).toBe(false)
    await act(async () => { accept.click() })
    expect(document.body.textContent).toContain('the app')
    view.unmount()
  })

  it('asks again when the stored version is not the current bundle', async () => {
    localStorage.setItem(ACCEPTANCE_STORAGE_KEY, JSON.stringify([{
      userId: 'user-1',
      bundleId: '1999-01-01.1',
      includesDpa: true,
    }]))
    const view = renderGate()
    await flush()
    expect(document.body.textContent).toContain('Before you continue')
    expect(document.body.textContent).not.toContain('the app')
    expect(LEGAL_BUNDLE.id).not.toBe('1999-01-01.1')
    view.unmount()
  })
})
