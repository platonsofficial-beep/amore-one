/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { isBootstrapping: false, isLoading: false, isAuthDisabled: true }

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

import { ColdStartSplash, resetColdStartSplashForTests } from './ColdStartSplash'

function renderSplash() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(ColdStartSplash))
  })
  return {
    container,
    rerender: () => {
      act(() => {
        root.render(createElement(ColdStartSplash))
      })
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ColdStartSplash', () => {
  beforeEach(() => {
    resetColdStartSplashForTests()
    auth.isBootstrapping = false
    auth.isLoading = false
    auth.isAuthDisabled = true
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('assembles the three triangles, the wordmark, and the tagline on navy', () => {
    const view = renderSplash()
    const splash = view.container.querySelector('[data-testid="cold-start-splash"]')
    expect(splash).toBeTruthy()
    expect(view.container.querySelectorAll('.cold-start-tri')).toHaveLength(3)
    expect(view.container.querySelector('.is-gold path')?.getAttribute('d')).toContain('M217.2,222.0')
    expect(view.container.querySelector('.is-blue path')?.getAttribute('d')).toContain('M277.0,490.0')
    expect(view.container.querySelector('.is-taupe path')?.getAttribute('d')).toContain('M426.4,240.0')
    expect(view.container.textContent).toContain('HOSPITALITY OPERATING SYSTEM')
    view.unmount()
  })

  it('keeps the full intro for at least 2.6s when the app is already ready', () => {
    vi.useFakeTimers()
    const view = renderSplash()
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(view.container.querySelector('.cold-start-splash')?.classList.contains('is-fading')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })

  it('holds the finished logo while loading, then leaves at the 4s cap', () => {
    vi.useFakeTimers()
    auth.isAuthDisabled = false
    auth.isBootstrapping = true
    const view = renderSplash()
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeTruthy()
    expect(view.container.querySelector('.cold-start-splash')?.classList.contains('is-fading')).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(view.container.querySelector('.cold-start-splash')?.classList.contains('is-fading')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })

  it('leaves once loading finishes after the minimum', () => {
    vi.useFakeTimers()
    auth.isAuthDisabled = false
    auth.isBootstrapping = true
    const view = renderSplash()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(view.container.querySelector('.is-fading')).toBeNull()
    auth.isBootstrapping = false
    act(() => {
      view.rerender()
    })
    expect(view.container.querySelector('.cold-start-splash')?.classList.contains('is-fading')).toBe(true)
    view.unmount()
  })

  it('skips on tap or a key, then fades', () => {
    vi.useFakeTimers()
    const view = renderSplash()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(view.container.querySelector('.cold-start-splash')?.classList.contains('is-fading')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })

  it('does not play again after this cold start', () => {
    vi.useFakeTimers()
    const first = renderSplash()
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    first.unmount()
    const second = renderSplash()
    expect(second.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    second.unmount()
  })

  it('uses a 200ms fade when motion is reduced and the app is not ready yet', () => {
    vi.useFakeTimers()
    auth.isAuthDisabled = false
    auth.isBootstrapping = true
    window.matchMedia = () => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener() {},
      removeEventListener() {},
    })
    const view = renderSplash()
    expect(view.container.querySelector('.cold-start-splash')?.classList.contains('is-reduced')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })

  it('skips the reduced-motion splash when the app is already ready', () => {
    window.matchMedia = () => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener() {},
      removeEventListener() {},
    })
    const view = renderSplash()
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })
})
