/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceBusinessProfileSection } from './WorkspaceBusinessProfileSection'

const baseProfile = {
  businessName: 'Amore',
  managerName: 'Alex',
  managerRole: 'GM',
  timezone: 'Europe/Nicosia',
  currency: 'EUR',
  logoUrl: '',
  countryCode: 'CY',
  countryName: 'Cyprus',
  city: 'Nicosia',
  defaultPhoneCountryCode: '+357',
}

function renderSection(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onSubmit = props.onSubmit ?? vi.fn()

  act(() => {
    root.render(createElement(WorkspaceBusinessProfileSection, {
      workspaceProfile: baseProfile,
      isLoading: false,
      isSaving: false,
      isDirty: true,
      onChange: vi.fn(),
      onSubmit,
      onLogoFileChange: vi.fn(),
      onClearLogo: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    onSubmit,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('WorkspaceBusinessProfileSection save button', () => {
  it('shows Save Profile by default', () => {
    const { container, cleanup } = renderSection()
    const button = container.querySelector('.workspace-action-btn')

    expect(button?.textContent).toContain('Save Profile')
    expect(button?.querySelector('.btn-loading-spinner')).toBeNull()

    cleanup()
  })

  it('shows Saving... while saving', () => {
    const { container, cleanup } = renderSection({ isSaving: true })
    const button = container.querySelector('.workspace-action-btn')

    expect(button?.textContent).toContain('Saving...')

    cleanup()
  })

  it('disables the button while saving', () => {
    const { container, cleanup } = renderSection({ isSaving: true })

    expect(container.querySelector('.workspace-action-btn')?.disabled).toBe(true)

    cleanup()
  })

  it('does not submit twice while saving', async () => {
    let resolveSave
    const onSubmit = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    const { container, cleanup } = renderSection({ onSubmit })

    await act(async () => {
      container.querySelector('form')?.requestSubmit()
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector('form')?.requestSubmit()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSave()
      await Promise.resolve()
    })

    cleanup()
  })

  it('renders the spinner inside the button content while saving', () => {
    const { container, cleanup } = renderSection({ isSaving: true })
    const button = container.querySelector('.workspace-action-btn')

    expect(button?.querySelector('.btn-loading-content')).not.toBeNull()
    expect(button?.querySelector('.btn-loading-spinner')).not.toBeNull()
    expect(button?.contains(button.querySelector('.btn-loading-spinner'))).toBe(true)

    cleanup()
  })
})
