/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileStaffApp } from './MobileStaffApp'

function renderHostApp(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileStaffApp, {
      shellVariant: 'host',
      activeTab: 'reservations',
      hostStationContent: createElement('div', { 'data-testid': 'host-station' }, 'Floor'),
      homeProps: { greeting: 'Hello host' },
      scheduleProps: {},
      tasksProps: { taskGroups: {}, needsEmployeeLink: true },
      menuProps: { screen: 'main', profileName: 'Host' },
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function navLabels(container) {
  return Array.from(container.querySelectorAll('.mobile-bottom-nav-label')).map((node) => node.textContent)
}

describe('MobileStaffApp host shell', () => {
  it('shows staff tabs plus reservations and keeps the host station on that tab', () => {
    const { container, unmount } = renderHostApp()

    expect(navLabels(container)).toEqual([
      'Home',
      'My Schedule',
      'My Availability',
      'Tasks',
      'Reservations',
      'Profile',
    ])
    expect(container.querySelector('[data-testid="host-station"]')).toBeTruthy()
    expect(container.querySelector('.mobile-app-host-station')).toBeTruthy()
    expect(container.querySelector('.mobile-bottom-nav')).toBeTruthy()
    expect(container.querySelector('.is-host-only-station')).toBeNull()
    unmount()
  })

  it('leaves the host station for staff screens without notifying on availability', () => {
    const onTabChange = vi.fn()
    const { container, unmount } = renderHostApp({ onTabChange })

    const home = Array.from(container.querySelectorAll('.mobile-bottom-nav-item'))
      .find((node) => node.textContent.includes('Home'))
    act(() => {
      home.click()
    })

    expect(onTabChange).toHaveBeenCalledWith('home')
    expect(container.querySelector('[data-testid="host-station"]')).toBeNull()
    expect(container.textContent).toContain('Hello host')
    expect(container.querySelector('.mobile-app-host-station')).toBeNull()

    const availability = Array.from(container.querySelectorAll('.mobile-bottom-nav-item'))
      .find((node) => node.textContent.includes('My Availability'))
    act(() => {
      availability.click()
    })

    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.mobile-availability-leave-dialog')).toBeNull()
    unmount()
  })
})
