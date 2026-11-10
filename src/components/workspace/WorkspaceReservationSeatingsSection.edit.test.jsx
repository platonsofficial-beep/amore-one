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

  it('leads the hours sheet with the sittings and leaves Settings cards out', () => {
    const view = renderSection({
      hoursOnly: true,
      seatings: [DINNER],
      autoCloseTime: '05:00',
      onAutoCloseTimeChange: vi.fn(),
      autoCloseNotice: "Cannot read properties of null (reading 'from')",
      noticeMessage: "Cannot read properties of null (reading 'from')",
    })

    const list = view.container.querySelector('[data-testid="seating-hours-list"]')
    expect(list?.textContent).toContain('Dinner 1')
    expect(list?.textContent).toContain('19:00')
    expect(list?.textContent).toContain('120 min')
    expect(view.container.textContent).not.toContain('Auto-close seated tables')
    expect(view.container.textContent).not.toContain('Configure service slots')
    expect(view.container.textContent).not.toContain('Cannot read properties')
    expect(view.container.textContent).toContain("Couldn't load seating hours.")
    expect(view.container.textContent.indexOf('Dinner 1')).toBeLessThan(
      view.container.textContent.indexOf("Couldn't load seating hours."),
    )

    view.unmount()
  })

  it('opens the hours editor in front of the sheet', () => {
    const onCancelEdit = vi.fn()
    const view = renderSection({
      hoursOnly: true,
      seatings: [DINNER],
      form: createDefaultSeatingForm(DINNER),
      editingSeatingId: DINNER.id,
      onCancelEdit,
    })

    const editor = document.body.querySelector('.seating-hours-followup')
    expect(editor).not.toBeNull()
    expect(view.container.contains(editor)).toBe(false)
    expect(view.container.querySelector('[data-testid="seating-hours-list"]')).not.toBeNull()
    expect(editor.textContent).toContain('Edit seating')
    expect(editor.querySelector('input[placeholder="e.g. Dinner 1"]')?.value).toBe('Dinner 1')

    const cancel = [...editor.querySelectorAll('button')].find((button) => button.textContent === 'Cancel edit')
    act(() => {
      cancel.click()
    })
    expect(onCancelEdit).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(document.body.querySelector('.seating-hours-followup')).toBeNull()
  })

  it('lets a host read hours without edit actions', () => {
    const view = renderSection({
      hoursOnly: true,
      canEdit: false,
      seatings: [DINNER],
    })

    expect(view.container.textContent).toContain('Dinner 1')
    expect(view.container.querySelector('.action-group')).toBeNull()
    expect(view.container.textContent).not.toContain('Add seating')

    view.unmount()
  })
})
