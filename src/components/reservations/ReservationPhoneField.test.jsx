/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { ReservationPhoneField } from './ReservationPhoneField'
import {
  resolveWorkspaceDefaultPhoneCountryCode,
  setWorkspaceDefaultPhoneCountryCode,
} from '../../lib/reservationPhoneUtils'

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

function renderField(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(ReservationPhoneField, props))
  })

  return {
    container,
    rerender(nextProps) {
      act(() => {
        root.render(createElement(ReservationPhoneField, nextProps))
      })
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function countryLabel(container) {
  return container.querySelector('.reservation-phone-field-country-picker-trigger-label')?.textContent ?? ''
}

describe('ReservationPhoneField venue default', () => {
  it('starts an empty phone on the venue dial code instead of the browser locale', () => {
    setWorkspaceDefaultPhoneCountryCode(resolveWorkspaceDefaultPhoneCountryCode({
      countryCode: 'CY',
      defaultPhoneCountryCode: '+357',
    }))

    const { container, unmount } = renderField({ value: '' })

    expect(countryLabel(container)).toContain('🇨🇾')
    expect(countryLabel(container)).toContain('+357')
    unmount()
  })

  it('uses a passed business profile when the shared default is still empty', () => {
    const { container, unmount } = renderField({
      value: '',
      workspaceProfile: { countryCode: 'GR' },
    })

    expect(countryLabel(container)).toContain('+30')
    unmount()
  })

  it('follows a venue default that arrives after the field is open', () => {
    const { container, unmount } = renderField({ value: '' })

    expect(countryLabel(container)).toContain('+357')

    act(() => {
      setWorkspaceDefaultPhoneCountryCode(resolveWorkspaceDefaultPhoneCountryCode({
        defaultPhoneCountryCode: '+44',
        countryCode: 'CY',
      }))
    })

    expect(countryLabel(container)).toContain('+44')
    unmount()
  })

  it('keeps the country stored on an existing reservation phone', () => {
    setWorkspaceDefaultPhoneCountryCode('+357')
    const { container, unmount } = renderField({ value: '+447911123456' })

    expect(countryLabel(container)).toContain('+44')
    unmount()
  })

  it('lets the flag picker replace the venue country', () => {
    setWorkspaceDefaultPhoneCountryCode(resolveWorkspaceDefaultPhoneCountryCode({
      countryCode: 'CY',
    }))
    const onChange = vi.fn()
    const { container, unmount } = renderField({ value: '', onChange })

    act(() => {
      container.querySelector('button')?.click()
    })

    const search = document.querySelector('.phone-country-picker-search')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(search, 'Greece')
      search?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const greece = [...document.querySelectorAll('.phone-country-picker-option-name')]
      .find((node) => node.textContent === 'Greece')
    act(() => {
      greece?.closest('button')?.click()
    })

    expect(countryLabel(container)).toContain('+30')

    act(() => {
      setWorkspaceDefaultPhoneCountryCode('+44')
    })

    expect(countryLabel(container)).toContain('+30')
    unmount()
  })
})
