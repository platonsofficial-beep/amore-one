/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getTimezonePickerValueForSelection } from '../../lib/workspaceTimezoneUtils'
import { WorkspaceTimezonePicker } from './WorkspaceTimezonePicker'

function renderPicker(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onChange = props.onChange ?? vi.fn()

  act(() => {
    root.render(createElement(WorkspaceTimezonePicker, { ...props, onChange }))
  })

  return {
    container,
    onChange,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
      document.querySelectorAll('.workspace-timezone-picker-portal').forEach((node) => node.remove())
    },
  }
}

describe('WorkspaceTimezonePicker', () => {
  it('shows saved Europe/Nicosia with country in the closed field', () => {
    const { container, cleanup } = renderPicker({
      value: 'Europe/Nicosia',
      countryName: 'Cyprus',
    })

    expect(container.querySelector('.workspace-timezone-picker-trigger-primary')?.textContent).toBe('Nicosia')
    expect(container.querySelector('.workspace-timezone-picker-trigger-secondary')?.textContent).toContain('Cyprus')
    expect(container.querySelector('.workspace-timezone-picker-trigger-secondary')?.textContent).not.toContain('Europe/Nicosia')

    cleanup()
  })

  it('falls back to IANA in the closed field when country is missing', () => {
    const { container, cleanup } = renderPicker({ value: 'America/New_York' })

    expect(container.querySelector('.workspace-timezone-picker-trigger-secondary')?.textContent).toContain('America/New_York')

    cleanup()
  })

  it('selects Nicosia and emits Europe/Nicosia', () => {
    const onChange = vi.fn()
    const { container, cleanup } = renderPicker({ value: '', onChange })

    act(() => {
      container.querySelector('.workspace-timezone-picker-trigger')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const nicosiaButton = Array.from(document.querySelectorAll('.workspace-timezone-picker-option'))
      .find((button) => button.textContent?.includes('Nicosia') && button.textContent?.includes('Europe/Nicosia'))

    act(() => {
      nicosiaButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith('Europe/Nicosia')
    cleanup()
  })

  it('supports keyboard enter selection', () => {
    const onChange = vi.fn()
    const { container, cleanup } = renderPicker({ value: '', onChange })

    act(() => {
      container.querySelector('.workspace-timezone-picker-trigger')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    act(() => {
      document.querySelector('.workspace-timezone-picker-portal')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })

    expect(onChange).toHaveBeenCalled()
    expect(getTimezonePickerValueForSelection({ kind: 'browser-default' })).toBe('')
    cleanup()
  })
})
