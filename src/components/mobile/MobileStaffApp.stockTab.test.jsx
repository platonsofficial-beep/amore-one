/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MobileStaffApp } from './MobileStaffApp'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function renderStaff(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(MobileStaffApp, {
      activeTab: 'home',
      homeProps: { greeting: 'Hello' },
      scheduleProps: {},
      tasksProps: { taskGroups: {}, needsEmployeeLink: true },
      menuProps: { screen: 'main', profileName: 'Staff' },
      ...props,
    }))
  })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

const labels = (c) => Array.from(c.querySelectorAll('.mobile-bottom-nav-label')).map((n) => n.textContent)

describe('MobileStaffApp staff Stock tab (S-02)', () => {
  it('has no Stock tab without stock access', () => {
    const { container, unmount } = renderStaff()
    expect(labels(container)).not.toContain('Stock')
    unmount()
  })

  it('shows Stock before Profile and opens Stock when tapped', () => {
    const onOpenStock = vi.fn()
    const onTabChange = vi.fn()
    const { container, unmount } = renderStaff({ onOpenStock, onTabChange })
    const l = labels(container)
    expect(l.indexOf('Stock')).toBe(l.length - 2)
    const btn = Array.from(container.querySelectorAll('.mobile-bottom-nav-label')).find((n) => n.textContent === 'Stock').closest('button')
    act(() => btn.click())
    expect(onOpenStock).toHaveBeenCalledTimes(1)
    expect(onTabChange).not.toHaveBeenCalledWith('stock')
    unmount()
  })

  it('highlights Stock while the Stock workspace is open', () => {
    const { container, unmount } = renderStaff({ onOpenStock: () => {}, isStockOpen: true })
    const btn = Array.from(container.querySelectorAll('.mobile-bottom-nav-label')).find((n) => n.textContent === 'Stock').closest('button')
    expect(btn.className + (btn.getAttribute('aria-current') || '') + (btn.getAttribute('aria-selected') || '')).toMatch(/active|page|true/)
    unmount()
  })
})
