/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MobileAvailabilityView } from './MobileAvailabilityView'

vi.mock('../../services/availabilityService', () => ({
  getEmployeeAvailabilityWeek: vi.fn(async () => ({
    days: [
      { dayOfWeek: 'monday', status: 'AVAILABLE', startTime: '09:00', endTime: '17:00', note: null },
    ],
  })),
  saveEmployeeAvailabilityWeek: vi.fn(),
}))

function renderView() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

describe('staff availability time fields', () => {
  it('uses full time boxes with an empty placeholder and the My week eyebrow', async () => {
    const { container, root } = renderView()

    await act(async () => {
      root.render(createElement(MobileAvailabilityView, {
        workspaceId: 'ws',
        employeeId: 'emp',
        weekStartDate: '2026-10-26',
        weekLabel: '26 Oct – 1 Nov',
      }))
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.mobile-screen-eyebrow')?.textContent).toBe('My week')
    expect(container.querySelector('.mobile-screen-title')?.textContent).toBe('Weekly availability')

    expect(container.querySelector('input[type="time"]')).toBeNull()
    expect(container.querySelector('[class*="placeholder"]')).toBeNull()

    const fields = Array.from(container.querySelectorAll('.hour-minute-field'))
    expect(fields).toHaveLength(14)
    const mondayStart = fields[0].querySelectorAll('select')
    const mondayEnd = fields[1].querySelectorAll('select')
    expect(mondayStart[0].value).toBe('09')
    expect(mondayStart[1].value).toBe('00')
    expect(mondayEnd[0].value).toBe('17')
    expect(mondayEnd[1].value).toBe('00')
    expect(mondayStart[0].selectedOptions[0].textContent).toBe('09')

    const emptyFields = fields.filter((field) => field.classList.contains('is-empty'))
    expect(emptyFields).toHaveLength(12)
    emptyFields.forEach((field) => {
      const [hour, minute] = field.querySelectorAll('select')
      expect(hour.value).toBe('')
      expect(minute.value).toBe('')
      expect(hour.selectedOptions[0].textContent).toBe('--')
      expect(minute.selectedOptions[0].textContent).toBe('--')
      expect(field.querySelectorAll('.hour-minute-sep')).toHaveLength(1)
      expect(field.textContent).not.toMatch(/AM|PM/)
    })
    expect(container.textContent).toContain('Start time (optional)')
    expect(container.textContent).toContain('End time (optional)')

    act(() => root.unmount())
    container.remove()
  })

  it('styles the shared 24-hour control as tappable boxes', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toContain('.hour-minute-field')
    expect(css).toContain('-webkit-appearance: none;')
    expect(css).toContain('appearance: none;')
    expect(css).toContain('min-height: 44px;')
    expect(css).toMatch(/\.hour-minute-field select \{[^}]*font-size: 16px;/s)
    expect(css).toMatch(/\.mobile-availability-field \.hour-minute-field \{[^}]*color: #fff7e8;/s)
    expect(css).not.toContain('.mobile-availability-time-placeholder')
    expect(css).not.toContain(".mobile-availability-input[type='time']")
    expect(css).toMatch(/@media \(max-width: 420px\) \{\s*\.mobile-availability-time-grid \{\s*grid-template-columns: 1fr;/)
  })
})
