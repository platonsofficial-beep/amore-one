/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HourMinuteField } from './HourMinuteField'

function renderField(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const update = (next) => {
    act(() => {
      root.render(createElement(HourMinuteField, { ...props, value: next, onChange: update }))
    })
  }
  act(() => {
    root.render(createElement(HourMinuteField, props))
  })
  return {
    container,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('HourMinuteField', () => {
  it('shows 23:00 as hour and minute selects, with no native time input', () => {
    const { container, cleanup } = renderField({ value: '23:00', ariaLabel: 'From' })
    expect(container.querySelector('input[type="time"]')).toBeNull()
    const [hour, minute] = container.querySelectorAll('select')
    expect(hour.value).toBe('23')
    expect(minute.value).toBe('00')
    expect(hour.querySelector('option[value="23"]').textContent).toBe('23')
    expect(container.textContent).not.toMatch(/AM|PM/)
    cleanup()
  })

  it('shows one --:-- placeholder while empty and saves HH:MM', () => {
    const onChange = vi.fn()
    const { container, cleanup } = renderField({ value: '', onChange, ariaLabel: 'Start time' })
    const [hour, minute] = container.querySelectorAll('select')
    expect(hour.value).toBe('')
    expect(minute.value).toBe('')
    expect(hour.selectedOptions[0].textContent).toBe('--')
    expect(minute.selectedOptions[0].textContent).toBe('--')
    expect(container.querySelectorAll('.hour-minute-sep')).toHaveLength(1)
    expect(container.querySelector('[class*="placeholder"]')).toBeNull()

    const setSelect = (select, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
      setter?.call(select, value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }

    act(() => {
      setSelect(hour, '07')
    })
    expect(onChange).not.toHaveBeenCalled()

    const minuteAfter = container.querySelectorAll('select')[1]
    act(() => {
      setSelect(minuteAfter, '30')
    })
    expect(onChange).toHaveBeenCalledWith('07:30')
    cleanup()
  })

  it('keeps an off-step minute visible', () => {
    const { container, cleanup } = renderField({ value: '09:07' })
    const minute = container.querySelectorAll('select')[1]
    expect(minute.value).toBe('07')
    expect(minute.querySelector('option[value="07"]')).toBeTruthy()
    cleanup()
  })
})
