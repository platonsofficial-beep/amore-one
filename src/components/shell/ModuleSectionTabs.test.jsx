/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { ModuleSectionTabs, tabRowOverflows } from './ModuleSectionTabs'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const sections = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orders', label: 'Orders' },
]

describe('tabRowOverflows', () => {
  it('is true only when the row is wider than its box', () => {
    expect(tabRowOverflows(null)).toBe(false)
    expect(tabRowOverflows({ scrollWidth: 800, clientWidth: 400 })).toBe(true)
    expect(tabRowOverflows({ scrollWidth: 400, clientWidth: 400 })).toBe(false)
  })
})

describe('ModuleSectionTabs', () => {
  it('marks the row when the tabs do not fit', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(createElement(ModuleSectionTabs, {
        sections,
        activeSection: 'dashboard',
        onSectionChange: () => {},
      }))
    })
    const nav = host.querySelector('.module-section-tabs')
    Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 900 })
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 320 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(nav.getAttribute('data-overflow')).toBe('true')
    Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 300 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(nav.hasAttribute('data-overflow')).toBe(false)
    act(() => root.unmount())
    host.remove()
  })
})
