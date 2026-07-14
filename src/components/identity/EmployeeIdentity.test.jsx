/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { EmployeeIdentity } from './EmployeeIdentity'

function renderIdentity(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(EmployeeIdentity, props))
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

describe('EmployeeIdentity', () => {
  it('renders initials with a colored ring by default', () => {
    const { container, cleanup } = renderIdentity({
      employee: { name: 'Platon Sachinis', identityColor: 'emerald' },
      size: 'md',
    })

    expect(container.querySelector('.employee-identity-initials')?.textContent).toBe('PS')
    expect(container.querySelector('.employee-identity-photo')).toBeNull()
    expect(container.querySelector('.employee-identity-unknown')).toBeNull()
    expect(container.querySelector('.employee-identity-ring')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.employee-identity-avatar')?.getAttribute('aria-label')).toContain('Platon Sachinis')

    cleanup()
  })

  it('renders photo when photoUrl is present', () => {
    const { container, cleanup } = renderIdentity({
      employee: {
        name: 'Evie',
        photoUrl: 'https://example.com/evie.jpg',
        identityColor: 'ocean',
      },
    })

    const image = container.querySelector('.employee-identity-photo')
    expect(image?.getAttribute('src')).toBe('https://example.com/evie.jpg')
    expect(image?.getAttribute('alt')).toBe('Evie profile photo')

    cleanup()
  })

  it('renders unknown placeholder for missing employees', () => {
    const { container, cleanup } = renderIdentity({ employee: null })

    expect(container.querySelector('.employee-identity-unknown')?.textContent).toBe('?')
    expect(container.querySelector('.employee-identity-avatar')?.getAttribute('aria-label')).toBe('Unknown employee')

    cleanup()
  })

  it('optionally renders name and role metadata', () => {
    const { container, cleanup } = renderIdentity({
      employee: {
        name: 'Platon Sachinis',
        position: 'Manager',
        identityColor: 'champagne',
      },
      showName: true,
      showRole: true,
    })

    expect(container.querySelector('.employee-identity-name')?.textContent).toBe('Platon Sachinis')
    expect(container.querySelector('.employee-identity-role')?.textContent).toBe('Manager')

    cleanup()
  })

  it('applies shared size classes without duplicating size logic', () => {
    const { container, cleanup } = renderIdentity({
      employee: { name: 'Evie' },
      size: 'xl',
    })

    expect(container.querySelector('.employee-identity-size-xl')).toBeTruthy()

    cleanup()
  })
})
