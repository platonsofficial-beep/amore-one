/**
 * @vitest-environment jsdom
 */
import { createElement, useState } from 'react'
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

function AsyncSaveHarness({ onSave }) {
  const [workspaceProfile, setWorkspaceProfile] = useState(baseProfile)

  return createElement(WorkspaceBusinessProfileSection, {
    workspaceProfile,
    isLoading: false,
    isSaving: false,
    isDirty: true,
    onChange: setWorkspaceProfile,
    onSubmit: onSave,
    onLogoFileChange: vi.fn(),
    onClearLogo: vi.fn(),
  })
}

describe('WorkspaceBusinessProfileSection async save render tree', () => {
  it('shows Saving... in the button while parent save is in flight', async () => {
    let resolveSave
    const onSave = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve
    }))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(AsyncSaveHarness, { onSave }))
    })

    const form = container.querySelector('form')
    const button = container.querySelector('.workspace-action-btn')

    expect(button?.textContent).toContain('Save Profile')
    expect(button?.querySelector('.btn-loading-content')).toBeNull()

    await act(async () => {
      form?.requestSubmit()
      await Promise.resolve()
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(button?.textContent).toContain('Saving...')
    expect(button?.querySelector('.btn-loading-content')).not.toBeNull()
    expect(button?.querySelector('.btn-loading-spinner')).not.toBeNull()

    await act(async () => {
      resolveSave()
      await Promise.resolve()
    })

    expect(button?.textContent).toContain('Save Profile')
    expect(button?.querySelector('.btn-loading-content')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
