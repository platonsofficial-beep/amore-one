/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  createHostReservationEditForm,
  HostReservationEditPanel,
} from './HostReservationEditPanel'
import {
  resolveWorkspaceDefaultPhoneCountryCode,
  setWorkspaceDefaultPhoneCountryCode,
} from '../../lib/reservationPhoneUtils'

vi.mock('../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({ layout: { zones: [], units: [] } }),
}))

const LAYOUT = { zones: [], units: [] }

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
  setWorkspaceDefaultPhoneCountryCode('')
})

afterEach(() => {
  setWorkspaceDefaultPhoneCountryCode('')
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function renderEditPanel(profile) {
  const reservation = {
    id: 'res-1',
    guestName: 'Alex Rivera',
    phone: '',
    date: '2026-07-10',
    time: '19:00',
    guests: 2,
    status: 'Confirmed',
    notes: '',
  }
  const form = createHostReservationEditForm(reservation, LAYOUT)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(HostReservationEditPanel, {
      reservation,
      form,
      onChange: vi.fn(),
      onSave: vi.fn(),
      onDelete: vi.fn(),
      onCancel: vi.fn(),
      todayKey: '2026-07-10',
      layout: LAYOUT,
      workspaceProfile: profile,
    }))
  })

  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('HostReservationEditPanel phone default', () => {
  it('starts an empty edit phone on the venue dial code from the shared profile default', () => {
    setWorkspaceDefaultPhoneCountryCode(resolveWorkspaceDefaultPhoneCountryCode({
      countryCode: 'CY',
    }))

    const { container, unmount } = renderEditPanel(null)
    const label = container.querySelector('.reservation-phone-field-country-picker-trigger-label')?.textContent ?? ''

    expect(label).toContain('+357')
    unmount()
  })

  it('uses the business profile passed into the edit panel', () => {
    const { container, unmount } = renderEditPanel({ defaultPhoneCountryCode: '+30' })
    const label = container.querySelector('.reservation-phone-field-country-picker-trigger-label')?.textContent ?? ''

    expect(label).toContain('+30')
    unmount()
  })
})
