/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

describe('WorkspaceBusinessProfileSection save button', () => {
  it('hides manager fields and still saves when they are empty', async () => {
    const onSubmit = vi.fn()
    const { container, cleanup } = renderSection({
      onSubmit,
      workspaceProfile: {
        ...baseProfile,
        businessName: '',
        managerName: '',
        managerRole: '',
      },
    })

    expect(container.textContent).not.toContain('Manager Full Name')
    expect(container.textContent).not.toContain('Manager Role')
    expect(container.textContent).not.toContain('manager details')
    expect(container.textContent).toContain('Set your business details so ONE can personalize dashboards and reports.')
    expect(container.querySelector('input')?.getAttribute('placeholder')).toBe('e.g. The Harbour Bar')

    await act(async () => {
      container.querySelector('form')?.requestSubmit()
      await Promise.resolve()
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('uses the flag dial-code picker and keeps the saved +code', () => {
    const onChange = vi.fn()
    const derived = renderSection({
      onChange,
      workspaceProfile: {
        ...baseProfile,
        countryCode: 'GR',
        defaultPhoneCountryCode: '',
      },
    })
    const derivedButton = derived.container.querySelector('.workspace-default-phone-country-trigger')
    expect(derivedButton?.textContent).toContain('+30')
    expect(derived.container.querySelector('input[placeholder="+357"]')).toBeNull()
    derived.cleanup()

    const saved = renderSection({ onChange })
    const trigger = saved.container.querySelector('.workspace-default-phone-country-trigger')
    expect(trigger?.textContent).toContain('+357')
    act(() => {
      trigger.click()
    })
    const greece = [...saved.container.ownerDocument.querySelectorAll('.phone-country-picker-option')]
      .find((button) => button.textContent.includes('+30'))
    act(() => {
      greece.click()
    })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ defaultPhoneCountryCode: '+30' }))
    saved.cleanup()
  })

  it('shows venue contact fields and blocks an invalid email', async () => {
    const onSubmit = vi.fn()
    const { container, cleanup } = renderSection({
      onSubmit,
      workspaceProfile: {
        ...baseProfile,
        venuePhone: '+35799111222',
        venueAddress: '12 Harbour Street',
        contactEmail: 'not-an-email',
      },
    })
    expect(container.textContent).toContain('Venue phone')
    expect(container.textContent).toContain('Address')
    expect(container.textContent).toContain('Contact email')
    expect(container.querySelector('#workspace-venue-phone')?.value).toBe('99111222')
    expect(container.querySelector('input[autocomplete="street-address"]')?.value).toBe('12 Harbour Street')

    await act(async () => {
      container.querySelector('form')?.requestSubmit()
      await Promise.resolve()
    })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Enter a valid email address.')
    cleanup()
  })

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

    expect(button?.textContent).toContain('Saving…')

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
