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

    const inputs = Array.from(container.querySelectorAll('input[type="time"]'))
    expect(inputs).toHaveLength(14)
    expect(inputs[0].value).toBe('09:00')
    expect(inputs[1].value).toBe('17:00')
    expect(inputs[0].placeholder).toBe('--:--')
    expect(container.querySelectorAll('.mobile-availability-time.is-empty')).toHaveLength(12)
    expect(container.querySelectorAll('.mobile-availability-time-placeholder')).toHaveLength(12)
    expect(container.querySelector('.mobile-availability-time-placeholder')?.textContent).toBe('--:--')
    const filledFields = Array.from(container.querySelectorAll('.mobile-availability-time:not(.is-empty)'))
    expect(filledFields).toHaveLength(2)
    filledFields.forEach((field) => {
      expect(field.querySelector('.mobile-availability-time-placeholder')).toBeNull()
    })
    expect(container.textContent).toContain('Start time (optional)')
    expect(container.textContent).toContain('End time (optional)')

    act(() => root.unmount())
    container.remove()
  })

  it('styles iOS time inputs as tappable boxes, not native sliders', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toContain(".mobile-availability-input[type='time']")
    expect(css).toContain('-webkit-appearance: none;')
    expect(css).toContain('appearance: none;')
    expect(css).toContain('min-height: 44px;')
    expect(css).toContain('.mobile-availability-time-placeholder')
    expect(css).toContain(".mobile-availability-time.is-empty .mobile-availability-input[type='time']::-webkit-datetime-edit")
    expect(css).toMatch(/\.mobile-availability-input\[type='time'\] \{[^}]*color: #fff7e8;/s)
    expect(css).toMatch(/@media \(max-width: 420px\) \{\s*\.mobile-availability-time-grid \{\s*grid-template-columns: 1fr;/)
  })
})
