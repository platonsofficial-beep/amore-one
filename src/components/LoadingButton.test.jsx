/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LoadingButton } from './LoadingButton'

function renderButton(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onClick = props.onClick ?? vi.fn()

  act(() => {
    root.render(createElement(LoadingButton, {
      children: 'Save',
      onClick,
      ...props,
    }))
  })

  return {
    container,
    onClick,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('LoadingButton', () => {
  it('renders label without spinner by default', () => {
    const { container, cleanup } = renderButton({ children: 'Save Profile' })
    const button = container.querySelector('button')

    expect(button?.textContent).toContain('Save Profile')
    expect(button?.querySelector('.btn-loading-spinner')).toBeNull()

    cleanup()
  })

  it('renders spinner and loading label inside the button while loading', () => {
    const { container, cleanup } = renderButton({
      loading: true,
      loadingLabel: 'Saving...',
      children: 'Save Profile',
    })
    const button = container.querySelector('button')
    const spinner = button?.querySelector('.btn-loading-spinner')

    expect(button?.textContent).toContain('Saving...')
    expect(button?.querySelector('.btn-loading-content')).not.toBeNull()
    expect(spinner).not.toBeNull()
    expect(button?.contains(spinner)).toBe(true)

    cleanup()
  })

  it('applies shared loading classes while loading', () => {
    const { container, cleanup } = renderButton({
      loading: true,
      loadingLabel: 'Receiving...',
    })
    const button = container.querySelector('button')
    const content = button?.querySelector('.btn-loading-content')
    const spinner = button?.querySelector('.btn-loading-spinner')

    expect(button?.className).toContain('is-loading')
    expect(content).not.toBeNull()
    expect(spinner).not.toBeNull()
    expect(button?.contains(spinner)).toBe(true)

    cleanup()
  })

  it('disables the button while loading', () => {
    const { container, cleanup } = renderButton({ loading: true })

    expect(container.querySelector('button')?.disabled).toBe(true)

    cleanup()
  })

  it('does not fire click while loading', () => {
    const onClick = vi.fn()
    const { container, cleanup } = renderButton({ loading: true, onClick })

    act(() => {
      container.querySelector('button')?.click()
    })

    expect(onClick).not.toHaveBeenCalled()

    cleanup()
  })

  it('shows loading content while an async click handler is in flight', async () => {
    let resolveClick
    const onClick = vi.fn(() => new Promise((resolve) => {
      resolveClick = resolve
    }))
    const { container, cleanup } = renderButton({ onClick, children: 'Confirm receive' })
    const button = container.querySelector('button')

    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button?.textContent).toContain('Confirm receive')
    expect(button?.querySelector('.btn-loading-content')).not.toBeNull()

    await act(async () => {
      resolveClick()
      await Promise.resolve()
    })

    expect(button?.querySelector('.btn-loading-content')).toBeNull()

    cleanup()
  })

  it('supports ghost variant class', () => {
    const { container, cleanup } = renderButton({ variant: 'ghost', children: 'Cancel' })
    const button = container.querySelector('button')

    expect(button?.className).toContain('ghost-btn')
    expect(button?.className).not.toContain('primary-btn')

    cleanup()
  })

  it('supports legacy isLoading prop', () => {
    const { container, cleanup } = renderButton({ isLoading: true, loadingLabel: 'Saving...' })

    expect(container.querySelector('.btn-loading-content')).not.toBeNull()

    cleanup()
  })
})
