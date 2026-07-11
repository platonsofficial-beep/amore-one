/**
 * @vitest-environment jsdom
 */
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LoadingButton } from '../LoadingButton'

function renderReviewReceiveButton(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onOpen = props.onOpen ?? vi.fn()

  act(() => {
    root.render(
      createElement(LoadingButton, {
        type: 'button',
        loading: false,
        disabled: false,
        onClick: onOpen,
        children: 'Review receive',
        ...props,
      }),
    )
  })

  return {
    container,
    onOpen,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('Stock review receive LoadingButton wiring', () => {
  it('fires the open-review callback without entering loading state', () => {
    const { container, onOpen, cleanup } = renderReviewReceiveButton()
    const button = container.querySelector('button')

    act(() => {
      button?.click()
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(button?.disabled).toBe(false)
    expect(button?.className).not.toContain('is-loading')
    expect(button?.querySelector('.btn-loading-content')).toBeNull()

    cleanup()
  })

  it('does not keep loading after a rejected async save action', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function Harness() {
      const [loading, setLoading] = useState(false)

      const handleSave = async () => {
        setLoading(true)
        try {
          await Promise.reject(new Error('save failed'))
        } catch {
          // handled by caller
        } finally {
          setLoading(false)
        }
      }

      return createElement(LoadingButton, {
        type: 'button',
        loading,
        loadingLabel: 'Saving...',
        onClick: handleSave,
        children: 'Save Profile',
      })
    }

    act(() => {
      root.render(createElement(Harness))
    })

    const button = container.querySelector('button')

    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(button?.className).not.toContain('is-loading')
    expect(button?.disabled).toBe(false)
    expect(button?.textContent).toContain('Save Profile')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
