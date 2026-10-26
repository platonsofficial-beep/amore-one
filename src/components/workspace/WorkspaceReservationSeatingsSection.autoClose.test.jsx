/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultSeatingForm,
  WorkspaceReservationSeatingsSection,
} from './WorkspaceReservationSeatingsSection'

describe('WorkspaceReservationSeatingsSection auto-close', () => {
  it('lets a manager save the Europe/Nicosia cutoff', () => {
    const onSaveAutoClose = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(WorkspaceReservationSeatingsSection, {
        form: createDefaultSeatingForm(),
        onFormChange: vi.fn(),
        onSubmit: (event) => event.preventDefault(),
        onStartEdit: vi.fn(),
        onCancelEdit: vi.fn(),
        onRequestDelete: vi.fn(),
        onMoveSeating: vi.fn(),
        onToggleActive: vi.fn(),
        autoCloseTime: '05:00',
        onAutoCloseTimeChange: vi.fn(),
        onSaveAutoClose,
      }))
    })

    expect(container.textContent).toContain('Auto-close seated tables')
    expect(container.textContent).toContain('Europe/Nicosia')
    const input = container.querySelector('input[type="time"]')
    expect(input?.value).toBe('05:00')

    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Save cutoff')
    act(() => save?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onSaveAutoClose).toHaveBeenCalled()

    act(() => root.unmount())
    container.remove()
  })
})
