/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { portraitShiftSubtitle } from '../../lib/managerPortrait'
import { ManagerMoreSheet } from './ManagerMoreSheet'
import { ManagerPortraitBanner } from './ManagerPortraitBanner'

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('manager portrait chrome', () => {
  it('shows a dismissible sideways banner', () => {
    const view = render(createElement(ManagerPortraitBanner, { area: 'stock-test' }))
    expect(view.container.textContent).toContain('Turn your phone sideways for the full view')
    const dismiss = view.container.querySelector('button[aria-label="Dismiss"]')
    expect(dismiss).toBeTruthy()
    act(() => {
      dismiss.click()
    })
    expect(view.container.textContent).not.toContain('Turn your phone sideways for the full view')
    view.unmount()
  })

  it('opens every other permitted area from More', () => {
    const onSelect = vi.fn()
    const view = render(createElement(ManagerMoreSheet, {
      isOpen: true,
      items: [
        { id: 'schedule', label: 'Schedule', subtitle: 'One day', icon: '📅' },
        { id: 'sign-out', label: 'Sign out', icon: '↪', tone: 'danger' },
      ],
      onClose: vi.fn(),
      onSelect,
    }))
    const schedule = Array.from(view.container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Schedule'))
    act(() => {
      schedule.click()
    })
    expect(onSelect).toHaveBeenCalledWith('schedule')
    view.unmount()
  })

  it('shows a repeated shift role once', () => {
    expect(portraitShiftSubtitle({ role: 'Service', area: 'Service' })).toBe('Service')
    expect(portraitShiftSubtitle({ role: 'Bartender', area: 'Bar' })).toBe('Bartender · Bar')
    expect(portraitShiftSubtitle({ role: '', area: '' })).toBe('Shift')
  })
})
