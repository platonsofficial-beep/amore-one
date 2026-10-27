/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
      'Schedule',
      'Tasks',
      'Bookings',
      'Profile',
    ])
    expect(container.querySelector('.mobile-bottom-nav-item[aria-label="Reservations"]')).toBeTruthy()
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

    const profile = Array.from(container.querySelectorAll('.mobile-bottom-nav-item'))
      .find((node) => node.textContent.includes('Profile'))
    act(() => {
      profile.click()
    })

    const availability = Array.from(container.querySelectorAll('.mobile-menu-btn'))
      .find((node) => node.textContent.includes('My Availability'))
    expect(availability).toBeTruthy()
    act(() => {
      availability.click()
    })

    expect(onTabChange).toHaveBeenCalledTimes(2)
    expect(onTabChange).toHaveBeenNthCalledWith(1, 'home')
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'menu')
    expect(container.textContent).toContain('Weekly availability')
    expect(container.querySelector('.mobile-availability-leave-dialog')).toBeNull()
    unmount()
  })

  it('keeps availability on the staff bar with labels that fit a phone', () => {
    const { container, unmount } = renderHostApp({
      shellVariant: 'staff',
      activeTab: 'home',
    })

    expect(navLabels(container)).toEqual([
      'Home',
      'Schedule',
      'Avail',
      'Tasks',
      'Profile',
    ])
    expect(container.querySelector('.mobile-bottom-nav-item[aria-label="My Availability"]')).toBeTruthy()
    unmount()
  })
})

describe('mobile task segment contrast', () => {
  it('paints the selected segment count in navy, including the pending alert state', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/mobileShell.css'), 'utf8')
    expect(css).toContain('.mobile-segmented-btn.is-active .mobile-segmented-count {\n  color: var(--one-navy-900);')
    expect(css).toContain('.mobile-segmented-btn.is-active.has-alert .mobile-segmented-count {\n  color: #6e2430;')
  })
})
