/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MobileReservationsHostRightPane } from './MobileReservationsHostRightPane'

function renderPane(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationsHostRightPane, props))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MobileReservationsHostRightPane layout states', () => {
  it('shows loading without calling the layout unpublished', () => {
    const { container, unmount } = renderPane({
      hasLayout: false,
      layoutStatus: 'loading',
      layoutMessage: 'Loading published layout…',
    })

    expect(container.textContent).toContain('Loading published layout…')
    expect(container.textContent).not.toContain('No published layout')
    unmount()
  })

  it('shows a floor load error without calling the layout unpublished', () => {
    const onRetryLayout = vi.fn()
    const { container, unmount } = renderPane({
      hasLayout: false,
      layoutStatus: 'error',
      layoutMessage: "Couldn't load",
      onRetryLayout,
    })

    expect(container.textContent).toContain("Couldn't load")
    expect(container.textContent).toContain('This is not an empty layout.')
    expect(container.textContent).not.toContain('No published layout')
    act(() => {
      container.querySelector('button')?.click()
    })
    expect(onRetryLayout).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('shows no published layout only after a confirmed empty load', () => {
    const { container, unmount } = renderPane({
      hasLayout: false,
      layoutStatus: 'empty',
    })

    expect(container.textContent).toContain('No published layout')
    unmount()
  })
})
