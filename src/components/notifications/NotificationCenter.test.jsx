/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NotificationBell, NotificationSettingsPanel } from './NotificationCenter'

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const items = [
  { id: '1', type: 'clockin_reminder_10', title: 'Clock in', body: 'Your shift started', created_at: '2026-10-27T08:00:00Z', read_at: null },
  { id: '2', type: 'schedule_published', title: 'Schedule', body: 'The new week is out', created_at: '2026-10-27T09:00:00Z', read_at: null },
  { id: '3', type: 'task_assigned', title: 'Task', body: 'Prep the bar', created_at: '2026-10-27T10:00:00Z', read_at: '2026-10-27T10:05:00Z' },
]

describe('notification bell sheet', () => {
  it('portals the list above the page so the bottom nav cannot clip it', () => {
    const { container, cleanup } = render(createElement(NotificationBell, { items }))
    const opener = container.querySelector('.notification-bell-btn')
    act(() => {
      opener.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const drawer = document.body.querySelector('.notification-drawer')
    expect(drawer).toBeTruthy()
    expect(container.contains(drawer)).toBe(false)
    expect(drawer.querySelectorAll('.notification-list-item')).toHaveLength(3)
    expect(document.body.querySelector('.notification-drawer-backdrop')).toBeTruthy()

    cleanup()
    expect(document.body.querySelector('.notification-drawer')).toBeNull()
  })

  it('keeps the sheet above the nav, scrollable, and safe-area aware', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
    const sheetAt = css.indexOf('@media (max-width: 900px) {\n  .notification-drawer {')
    expect(sheetAt).toBeGreaterThan(-1)
    const sheetRule = css.slice(sheetAt, sheetAt + 900)
    expect(css).toMatch(/\.notification-drawer \{[^}]*z-index: 1310;/s)
    expect(css).toMatch(/\.notification-drawer \{[^}]*box-sizing: border-box;/s)
    expect(sheetRule).toContain('env(safe-area-inset-bottom, 0px)')
    expect(sheetRule).toContain('env(safe-area-inset-top, 0px)')
    expect(sheetRule).toContain('env(safe-area-inset-left, 0px)')
    expect(sheetRule).toContain('env(safe-area-inset-right, 0px)')
    expect(sheetRule).toContain('--one-mobile-bottom-nav-height')
    expect(sheetRule).toContain('100dvh')
    expect(css).toContain('top: 72px;')
    expect(css).toMatch(/\.notification-list \{[^}]*overflow-y: auto;/s)
    expect(css).toMatch(/\.notification-list \{[^}]*min-height: 0;/s)
  })
})

describe('quiet hours', () => {
  it('shows 23:00 in 24-hour form and saves a 24-hour value', () => {
    const onQuietChange = vi.fn()
    const { container, cleanup } = render(createElement(NotificationSettingsPanel, {
      preferences: [{
        type: 'all',
        push_enabled: true,
        quiet_enabled: true,
        quiet_start: '23:00:00',
        quiet_end: '08:00:00',
      }],
      onQuietChange,
    }))

    const faces = Array.from(container.querySelectorAll('.notification-quiet-time-face'))
    expect(faces.map((face) => face.textContent)).toEqual(['23:00', '08:00'])
    expect(container.textContent).not.toMatch(/11:00|PM|AM/)

    const inputs = Array.from(container.querySelectorAll('input[type="time"]'))
    expect(inputs.map((input) => input.value)).toEqual(['23:00', '08:00'])
    expect(inputs[0].getAttribute('lang')).toBe('en-GB')

    act(() => {
      setInputValue(inputs[0], '07:30:00')
    })
    expect(onQuietChange).toHaveBeenCalledWith(expect.objectContaining({
      quietStart: '07:30',
      quietEnd: '08:00',
    }))

    cleanup()
  })

  it('gives each quiet-hour field a full column and a 44px box', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toMatch(/\.notification-quiet-times \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/s)
    expect(css).toMatch(/\.notification-quiet-times \{[^}]*width: 100%;/s)
    expect(css).toContain(".notification-quiet-time-box input[type='time']")
    expect(css).toMatch(/\.notification-quiet-time-box input\[type='time'\] \{[^}]*-webkit-appearance: none;/s)
    expect(css).toMatch(/\.notification-quiet-time-box input\[type='time'\] \{[^}]*min-height: 44px;/s)
    expect(css).toMatch(/\.notification-quiet-time-box input\[type='time'\] \{[^}]*width: 100%;/s)
    expect(css).toContain('.notification-quiet-time-face')
  })
})
