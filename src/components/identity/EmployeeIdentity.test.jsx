/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { AvatarDirectoryContext } from '../../context/AvatarDirectoryContext'
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

  it('uses a signed avatar from the directory and still falls back to initials', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const directory = {
      lookup: ({ employeeId }) => (
        employeeId === 'emp-1'
          ? { url: 'https://signed.example/alex.jpg', updatedAt: '9', path: 'user/alex.jpg' }
          : null
      ),
      setOptimistic() {},
      refresh: async () => {},
    }

    act(() => {
      root.render(createElement(AvatarDirectoryContext.Provider, { value: directory },
        createElement('div', null,
          createElement(EmployeeIdentity, { employee: { id: 'emp-1', name: 'Alex Kim' } }),
          createElement(EmployeeIdentity, { employee: { id: 'emp-2', name: 'Mina Costa' } }),
        ),
      ))
    })

    const images = container.querySelectorAll('.employee-identity-photo')
    expect(images).toHaveLength(1)
    expect(images[0].getAttribute('src')).toBe('https://signed.example/alex.jpg?v=9')
    expect(container.querySelector('.employee-identity-initials')?.textContent).toBe('MC')

    act(() => root.unmount())
    container.remove()
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
