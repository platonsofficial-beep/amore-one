/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ColdStartSplash', () => {
  beforeEach(() => {
    resetColdStartSplashForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the logo and leaves after the intro', () => {
    vi.useFakeTimers()
    const view = renderSplash()
    expect(view.container.querySelector('[data-testid="cold-start-splash"] img')?.getAttribute('src'))
      .toBe('/brand/one-full-logo.svg')
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })

  it('skips immediately when tapped', () => {
    const view = renderSplash()
    const splash = view.container.querySelector('[data-testid="cold-start-splash"]')
    act(() => {
      splash?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(view.container.querySelector('[data-testid="cold-start-splash"]')).toBeNull()
    view.unmount()
  })
})
