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

  act(() => {
    root.render(createElement(LoadingButton, {
      children: 'Save',
      ...props,
    }))
  })

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('LoadingButton', () => {
  it('renders a native button element', () => {
    const { container, cleanup } = renderButton()
    const button = container.querySelector('button')

    expect(button?.tagName).toBe('BUTTON')
    expect(button?.querySelector('.btn-loading-spinner')).toBeNull()

    cleanup()
  })

  it('defaults loading to false and stays enabled when not disabled', () => {
    const { container, cleanup } = renderButton({ children: 'Save Profile' })
    const button = container.querySelector('button')

    expect(button?.disabled).toBe(false)
    expect(button?.className).not.toContain('is-loading')

    cleanup()
  })

  it('fires onClick in the normal enabled state', () => {
    const onClick = vi.fn()
    const { container, cleanup } = renderButton({ onClick, children: 'Review receive' })

    act(() => {
      container.querySelector('button')?.click()
    })

    expect(onClick).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('does not treat string false as loading', () => {
    const { container, cleanup } = renderButton({ loading: 'false', children: 'Save Profile' })
    const button = container.querySelector('button')

    expect(button?.disabled).toBe(false)
    expect(button?.className).not.toContain('is-loading')
    expect(button?.querySelector('.btn-loading-content')).toBeNull()

    cleanup()
  })

  it('forwards arbitrary button props to the rendered button', () => {
    const { container, cleanup } = renderButton({
      name: 'save-profile',
      value: 'save',
      'aria-label': 'Save profile',
      'data-testid': 'save-profile-btn',
      form: 'profile-form',
    })
    const button = container.querySelector('button')

    expect(button?.getAttribute('name')).toBe('save-profile')
    expect(button?.getAttribute('value')).toBe('save')
    expect(button?.getAttribute('aria-label')).toBe('Save profile')
    expect(button?.getAttribute('data-testid')).toBe('save-profile-btn')
    expect(button?.getAttribute('form')).toBe('profile-form')

    cleanup()
  })

  it('preserves type="submit" and submits the parent form', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement('form', { onSubmit },
          createElement(LoadingButton, { type: 'submit', children: 'Save Profile' }),
        ),
      )
    })

    const button = container.querySelector('button')
    expect(button?.getAttribute('type')).toBe('submit')

    act(() => {
      button?.click()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('does not disable the submit button on pointerdown before click', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement('form', { onSubmit },
          createElement(LoadingButton, { type: 'submit', children: 'Save Profile' }),
        ),
      )
    })

    const button = container.querySelector('button')

    act(() => {
      button?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })

    expect(button?.disabled).toBe(false)

    act(() => {
      button?.click()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('disables the button only while loading is true', () => {
    const { container, cleanup } = renderButton({ loading: true })

    expect(container.querySelector('button')?.disabled).toBe(true)

    cleanup()
  })

  it('blocks clicks while loading', () => {
    const onClick = vi.fn()
    const { container, cleanup } = renderButton({ loading: true, onClick })

    act(() => {
      container.querySelector('button')?.click()
    })

    expect(onClick).not.toHaveBeenCalled()

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
    expect(button?.className).toContain('is-loading')

    cleanup()
  })

  it('keeps disabled-only buttons out of loading mode', () => {
    const { container, cleanup } = renderButton({ disabled: true, children: 'Save Profile' })
    const button = container.querySelector('button')

    expect(button?.disabled).toBe(true)
    expect(button?.className).not.toContain('is-loading')

    cleanup()
  })

  it('supports ghost variant class', () => {
    const { container, cleanup } = renderButton({ variant: 'ghost', children: 'Cancel' })
    const button = container.querySelector('button')

    expect(button?.className).toContain('ghost-btn')
    expect(button?.className).not.toContain('primary-btn')

    cleanup()
  })

  it('supports legacy isLoading prop when true', () => {
    const { container, cleanup } = renderButton({ isLoading: true, loadingLabel: 'Saving...' })

    expect(container.querySelector('.btn-loading-content')).not.toBeNull()

    cleanup()
  })
})
