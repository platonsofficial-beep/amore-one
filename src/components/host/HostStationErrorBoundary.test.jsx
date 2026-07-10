/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HostStationErrorBoundary } from './HostStationErrorBoundary'

function ThrowingChild() {
  throw new Error('Host floor render failed')
}

function renderBoundary(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      createElement(HostStationErrorBoundary, props,
        createElement(ThrowingChild),
      ),
    )
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('HostStationErrorBoundary', () => {
  it('shows fallback UI instead of a blank screen', () => {
    const { container, unmount } = renderBoundary()

    expect(container.textContent).toContain('Host Station could not load')
    expect(container.querySelector('.host-station-error-retry')).toBeTruthy()

    unmount()
  })

  it('offers return to editor action', () => {
    const onReturnToEditor = vi.fn()
    const { container, unmount } = renderBoundary({ onReturnToEditor })

    const button = container.querySelector('.host-station-error-return-editor')
    expect(button).toBeTruthy()
    act(() => button.click())
    expect(onReturnToEditor).toHaveBeenCalled()

    unmount()
  })
})
