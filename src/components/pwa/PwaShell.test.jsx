/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PwaShell } from './PwaShell.jsx'
import {
  markPwaUpdateAvailable,
  resetPwaUpdateSessionForTests,
} from '../../lib/pwaUpdate.js'

const { reloadMock } = vi.hoisted(() => ({
  reloadMock: vi.fn(() => true),
}))

vi.mock('../../lib/pwaUpdate.js', async () => {
  const actual = await vi.importActual('../../lib/pwaUpdate.js')
  return {
    ...actual,
    reloadPwaForUpdate: (...args) => reloadMock(...args),
  }
})

describe('PwaShell update banner', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
    resetPwaUpdateSessionForTests()
    reloadMock.mockClear()
  })

  function renderShell() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(PwaShell, null, createElement('p', null, 'App')))
    })
  }

  it('stays hidden until a new version is waiting, then refreshes on tap', () => {
    renderShell()
    expect(container.querySelector('[data-pwa-update="refresh"]')).toBeNull()
    expect(container.textContent).toContain('App')

    act(() => {
      markPwaUpdateAvailable()
    })

    const banner = container.querySelector('.pwa-update-banner')
    expect(banner?.textContent).toContain('New version available — Refresh')
    const button = container.querySelector('[data-pwa-update="refresh"]')
    expect(button).not.toBeNull()

    act(() => {
      button.click()
    })

    expect(reloadMock).toHaveBeenCalledOnce()
    expect(reloadMock.mock.calls[0][2]).toEqual({ force: true })
  })
})
