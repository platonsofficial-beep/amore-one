/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScheduleCardActionMenu } from './ScheduleCardActionMenu'
import { placeScheduleActionMenu } from '../../lib/scheduleActionMenuPosition'

const MENU_HEIGHT = 280
const MENU_WIDTH = 188

function rect({ top, left, width, height }) {
  return {
    x: left,
    y: top,
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() { return {} },
  }
}

describe('placeScheduleActionMenu', () => {
  it('opens below a trigger that has room in the viewport', () => {
    const placed = placeScheduleActionMenu({
      anchorRect: rect({ top: 80, left: 356, width: 44, height: 44 }),
      menuWidth: MENU_WIDTH,
      menuHeight: 240,
      viewportWidth: 1024,
      viewportHeight: 768,
    })

    expect(placed.placement).toBe('below')
    expect(placed.top).toBe(124 + 6)
    expect(placed.left).toBe(400 - MENU_WIDTH)
  })

  it('flips above the last department row when the items would pass the viewport', () => {
    const anchor = rect({ top: 700, left: 936, width: 44, height: 44 })
    const placed = placeScheduleActionMenu({
      anchorRect: anchor,
      menuWidth: MENU_WIDTH,
      menuHeight: MENU_HEIGHT,
      viewportWidth: 1024,
      viewportHeight: 768,
    })

    expect(placed.placement).toBe('above')
    expect(placed.top).toBe(anchor.top - MENU_HEIGHT - 6)
    expect(placed.top + MENU_HEIGHT).toBeLessThanOrEqual(anchor.top)
    expect(placed.top).toBeGreaterThanOrEqual(8)
  })

  it('shifts a menu that is taller than the free space back inside the viewport', () => {
    const placed = placeScheduleActionMenu({
      anchorRect: rect({ top: 300, left: 20, width: 44, height: 44 }),
      menuWidth: MENU_WIDTH,
      menuHeight: 500,
      viewportWidth: 400,
      viewportHeight: 400,
    })

    expect(placed.placement).toBe('above')
    expect(placed.top).toBe(8)
    expect(placed.left).toBe(8)
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(400 - 8)
  })

  it('keeps a right-edge trigger from painting the menu past the viewport', () => {
    const placed = placeScheduleActionMenu({
      anchorRect: rect({ top: 80, left: 960, width: 44, height: 44 }),
      menuWidth: MENU_WIDTH,
      menuHeight: 120,
      viewportWidth: 1000,
      viewportHeight: 768,
    })

    expect(placed.left + MENU_WIDTH).toBeLessThanOrEqual(1000 - 8)
  })
})

describe('ScheduleCardActionMenu', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  let view = null

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect
    view?.unmount()
    view = null
    document.body.innerHTML = ''
  })

  function renderMenu({ anchorRect, onClose = vi.fn(), viewport = { width: 1200, height: 800 } } = {}) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height })

    HTMLElement.prototype.getBoundingClientRect = function mockRect() {
      if (this.getAttribute('role') === 'menu') {
        return rect({ top: 0, left: 0, width: MENU_WIDTH, height: MENU_HEIGHT })
      }
      return rect({ top: 0, left: 0, width: 0, height: 0 })
    }

    const anchor = document.createElement('button')
    anchor.type = 'button'
    anchor.getBoundingClientRect = () => anchorRect
    document.body.appendChild(anchor)

    const host = document.createElement('div')
    host.style.overflow = 'hidden'
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(createElement(ScheduleCardActionMenu, {
        isOpen: true,
        onClose,
        anchorEl: anchor,
      }, createElement('button', { type: 'button', className: 'template-card-menu-item' }, 'Duplicate shift'), createElement('button', { type: 'button', className: 'template-card-menu-item danger' }, 'Remove shift')))
    })

    view = {
      host,
      anchor,
      onClose,
      unmount() {
        act(() => root.unmount())
        host.remove()
        anchor.remove()
      },
    }
    return view
  }

  it('portals the menu to the document and flips it above a bottom-row trigger', () => {
    const anchorRect = rect({ top: 740, left: 900, width: 44, height: 44 })
    const rendered = renderMenu({ anchorRect, viewport: { width: 1200, height: 800 } })
    const menu = document.body.querySelector('[role="menu"]')

    expect(menu).not.toBeNull()
    expect(rendered.host.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
    expect(menu.dataset.placement).toBe('above')
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(anchorRect.top)
    expect(menu.textContent).toContain('Remove shift')
  })

  it('keeps the menu open while it scrolls and closes when the page scrolls', () => {
    const onClose = vi.fn()
    renderMenu({
      onClose,
      anchorRect: rect({ top: 80, left: 400, width: 44, height: 44 }),
    })
    const menu = document.body.querySelector('[role="menu"]')

    menu.dispatchEvent(new Event('scroll', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()

    document.dispatchEvent(new Event('scroll', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
