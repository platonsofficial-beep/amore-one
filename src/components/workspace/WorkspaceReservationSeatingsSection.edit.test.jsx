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

const DINNER = {
  id: 'dinner-1',
  name: 'Dinner 1',
  startTime: '19:00',
  durationMinutes: 120,
  daysOfWeek: [5, 6],
  sortOrder: 0,
  isActive: true,
}

function renderSection(props = {}) {
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
      ...props,
    }))
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('reservation seating edit form', () => {
  it('prefills the seating name for edit, including the owner path', () => {
    const form = createDefaultSeatingForm(DINNER)
    expect(form.name).toBe('Dinner 1')
    expect(form.startTime).toBe('19:00')
    expect(form.durationMinutes).toBe(120)
    expect(form.isActive).toBe(true)

    const view = renderSection({
      seatings: [DINNER],
      form,
      editingSeatingId: DINNER.id,
    })

    const name = view.container.querySelector('input[placeholder="e.g. Dinner 1"]')
    expect(name?.value).toBe('Dinner 1')
    expect(name?.required).toBe(true)
    expect(view.container.textContent).toContain('Update seating')

    const activeDays = [...view.container.querySelectorAll('.workspace-seating-day-chip.is-active')]
      .map((chip) => chip.textContent)
    expect(activeDays).toEqual(['Fri', 'Sat'])
    expect(view.container.querySelector('.workspace-seating-day-chip[aria-pressed="true"]')).not.toBeNull()

    view.unmount()
  })

  it('passes the clicked seating, name included, into edit', () => {
    const onStartEdit = vi.fn()
    const view = renderSection({
      seatings: [DINNER],
      onStartEdit,
    })

    const edit = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Edit')
    act(() => {
      edit.click()
    })

    expect(onStartEdit).toHaveBeenCalledWith(expect.objectContaining({
      id: 'dinner-1',
      name: 'Dinner 1',
    }))
    expect(createDefaultSeatingForm(onStartEdit.mock.calls[0][0]).name).toBe('Dinner 1')

    view.unmount()
  })
})
