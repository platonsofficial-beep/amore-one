/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HostQuickCreateTableField } from './HostQuickCreateTableField'
import { createHostQuickCreateFormState } from '../../../lib/hostQuickCreateForm'

const SEATINGS = [
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    start_time: '21:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 0,
    is_active: true,
  },
]

const LAYOUT = {
  zones: [{ id: 'main', label: 'Main Dining' }],
  units: [
    { id: 't18', label: 'T18', zoneId: 'main', seatedCapacity: 4, maxGuestCapacity: 4 },
    { id: 't13', label: 'T13', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 2 },
    { id: 't15', label: 'T15', zoneId: 'main', seatedCapacity: 4, maxGuestCapacity: 4 },
  ],
}

const OCCUPIED_RESERVATION = {
  id: 'res-occupied',
  guestName: 'Alex',
  date: '2026-07-10',
  time: '21:00',
  guests: 2,
  status: 'Confirmed',
  seatingId: 'dinner-2',
  seatingAssignment: {
    assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
    extraChairs: 0,
    standingGuests: 0,
  },
}

function buildReadyForm(overrides = {}) {
  return createHostQuickCreateFormState(
    {
      date: '2026-07-10',
      time: '21:00',
      seatingId: 'dinner-2',
      seatingAreaId: 'main',
      area: 'Main Dining',
      guests: '2',
      ...overrides,
    },
    { todayKey: '2026-07-10', layout: LAYOUT, seatings: SEATINGS },
  )
}

function renderField({
  form = buildReadyForm(),
  reservations = [],
  onSelectTable = vi.fn(),
  onClearTable = vi.fn(),
} = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let latestForm = form

  const rerender = (nextForm) => {
    latestForm = nextForm
    act(() => {
      root.render(createElement(HostQuickCreateTableField, {
        form: latestForm,
        layout: LAYOUT,
        reservations,
        seatings: SEATINGS,
        onSelectTable: (unit) => {
          onSelectTable(unit)
        },
        onClearTable: () => {
          onClearTable()
        },
      }))
    })
  }

  rerender(latestForm)

  return {
    container,
    getLatestForm: () => latestForm,
    rerender,
    onSelectTable,
    onClearTable,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function getTableButton(container, label) {
  return [...container.querySelectorAll('.mobile-host-quick-create-table-option')]
    .find((button) => button.textContent?.includes(label)) ?? null
}

describe('HostQuickCreateTableField', () => {
  it('renders each table option as a type="button" control', () => {
    const { container, unmount } = renderField()

    const buttons = container.querySelectorAll('.mobile-host-quick-create-table-option')
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((button) => {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
    })

    unmount()
  })

  it('shows No table selected before a table is chosen', () => {
    const { container, unmount } = renderField()

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('No table selected')

    unmount()
  })

  it('calls onSelectTable when an available table is tapped', () => {
    const onSelectTable = vi.fn()
    const { container, unmount } = renderField({ onSelectTable })

    const t18Button = getTableButton(container, 'T18')
    act(() => {
      t18Button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectTable).toHaveBeenCalledTimes(1)
    expect(onSelectTable.mock.calls[0][0].id).toBe('t18')

    unmount()
  })

  it('updates aria-pressed and summary when parent re-renders with a selection', () => {
    const { container, rerender, unmount } = renderField()
    const selectedUnit = LAYOUT.units.find((unit) => unit.id === 't18')

    rerender({
      ...buildReadyForm(),
      assignedUnits: [{
        id: selectedUnit.id,
        label: selectedUnit.label,
        seatedCapacity: selectedUnit.seatedCapacity,
        maxGuestCapacity: selectedUnit.maxGuestCapacity,
      }],
    })

    const t18Button = getTableButton(container, 'T18')
    expect(t18Button?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected table · T18')
    expect(t18Button?.classList.contains('is-selected')).toBe(true)

    unmount()
  })

  it('replaces the previous selection when another available table is tapped', () => {
    const onSelectTable = vi.fn()
    let form = buildReadyForm()
    const { container, rerender, unmount } = renderField({ form, onSelectTable })

    act(() => {
      getTableButton(container, 'T18')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    form = {
      ...form,
      assignedUnits: [{
        id: 't18',
        label: 'T18',
        seatedCapacity: 4,
        maxGuestCapacity: 4,
      }],
    }
    rerender(form)

    act(() => {
      getTableButton(container, 'T13')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectTable).toHaveBeenCalledTimes(2)
    expect(onSelectTable.mock.calls[1][0].id).toBe('t13')

    unmount()
  })

  it('does not call onSelectTable for disabled conflicting tables', () => {
    const onSelectTable = vi.fn()
    const { container, unmount } = renderField({
      reservations: [OCCUPIED_RESERVATION],
      onSelectTable,
    })

    const t15Button = getTableButton(container, 'T15')
    expect(t15Button?.disabled).toBe(true)
    expect(t15Button?.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      t15Button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectTable).not.toHaveBeenCalled()

    unmount()
  })

  it('does not submit a parent form when a table is clicked', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const form = buildReadyForm()

    act(() => {
      root.render(
        createElement('form', {
          onSubmit,
        }, createElement(HostQuickCreateTableField, {
          form,
          layout: LAYOUT,
          reservations: [],
          seatings: SEATINGS,
          onSelectTable: vi.fn(),
          onClearTable: vi.fn(),
        })),
      )
    })

    act(() => {
      getTableButton(container, 'T18')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).not.toHaveBeenCalled()

    act(() => root.unmount())
    container.remove()
  })
})
