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
  onToggleExtraChair = vi.fn(),
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
        onToggleExtraChair: () => {
          onToggleExtraChair()
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

  it('adds a second table instead of replacing the first selection', () => {
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

  it('renders compact table capacity labels', () => {
    const { container, unmount } = renderField()

    const t18Button = getTableButton(container, 'T18')
    expect(t18Button?.querySelector('.mobile-host-quick-create-table-option-label')?.textContent).toBe('T18')
    expect(t18Button?.querySelector('.mobile-host-quick-create-table-option-capacity')?.textContent).toBe('👤4')

    unmount()
  })

  it('shows plural selection summary and capacity summary for multiple tables', () => {
    const { container, rerender, unmount } = renderField()

    rerender({
      ...buildReadyForm(),
      guests: '4',
      assignedUnits: [
        { id: 't13', label: 'T13', seatedCapacity: 2, maxGuestCapacity: 2 },
        { id: 't18', label: 'T18', seatedCapacity: 4, maxGuestCapacity: 4 },
      ],
    })

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected tables · T13 + T18')
    expect(container.querySelector('.mobile-host-quick-create-table-capacity-summary')?.textContent)
      .toBe('Capacity 6 · Guests 4')

    unmount()
  })

  it('allows tapping a selected table to remove only that table', () => {
    const onSelectTable = vi.fn()
    const { container, rerender, unmount } = renderField({
      form: {
        ...buildReadyForm(),
        assignedUnits: [
          { id: 't13', label: 'T13', seatedCapacity: 2, maxGuestCapacity: 2 },
          { id: 't18', label: 'T18', seatedCapacity: 4, maxGuestCapacity: 4 },
        ],
      },
      onSelectTable,
    })

    const t13Button = getTableButton(container, 'T13')
    expect(t13Button?.getAttribute('aria-pressed')).toBe('true')
    expect(t13Button?.disabled).toBe(false)

    act(() => {
      t13Button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectTable).toHaveBeenCalledWith(expect.objectContaining({ id: 't13' }))

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

describe('HostQuickCreateTableField extra chair', () => {
  const selectedT18 = {
    id: 't18',
    label: 'T18',
    seatedCapacity: 6,
    maxGuestCapacity: 6,
  }

  it('hides Extra Chair when no table is selected', () => {
    const { container, unmount } = renderField()

    expect(container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')).toBeNull()
    expect(container.querySelector('.mobile-host-quick-create-capacity-row')).toBeNull()

    unmount()
  })

  it('shows Extra Chair after selecting a table', () => {
    const { container, rerender, unmount } = renderField()

    rerender({
      ...buildReadyForm(),
      assignedUnits: [selectedT18],
    })

    expect(container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')).not.toBeNull()
    expect(container.querySelector('.mobile-host-quick-create-capacity-row')).not.toBeNull()

    unmount()
  })

  it('starts inactive and toggles exactly one extra chair', () => {
    const onToggleExtraChair = vi.fn()
    const { container, rerender, unmount } = renderField({
      form: {
        ...buildReadyForm(),
        assignedUnits: [selectedT18],
        extraChairs: 0,
      },
      onToggleExtraChair,
    })

    const toggle = container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(toggle?.classList.contains('is-active')).toBe(false)

    act(() => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggleExtraChair).toHaveBeenCalledTimes(1)

    rerender({
      ...buildReadyForm(),
      guests: '7',
      assignedUnits: [selectedT18],
      extraChairs: 1,
    })

    const activeToggle = container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')
    expect(activeToggle?.getAttribute('aria-pressed')).toBe('true')
    expect(activeToggle?.classList.contains('is-active')).toBe(true)
    expect(container.querySelector('.mobile-host-quick-create-table-capacity-summary')?.textContent)
      .toBe('Capacity 6 + 1 chair · Guests 7')

    act(() => {
      activeToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggleExtraChair).toHaveBeenCalledTimes(2)

    rerender({
      ...buildReadyForm(),
      guests: '7',
      assignedUnits: [selectedT18],
      extraChairs: 0,
    })

    expect(container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')?.getAttribute('aria-pressed'))
      .toBe('false')
    expect(container.querySelector('.mobile-host-quick-create-table-capacity-summary')?.textContent)
      .toBe('Capacity 6 · Guests 7')

    unmount()
  })

  it('warns for Capacity 6 / Guests 7 when inactive and clears warning when active', () => {
    const { container, rerender, unmount } = renderField()

    rerender({
      ...buildReadyForm(),
      guests: '7',
      assignedUnits: [selectedT18],
      extraChairs: 0,
    })

    expect(container.querySelector('.mobile-host-quick-create-table-capacity-warning')?.textContent)
      .toContain('below party size by 1 guest')

    rerender({
      ...buildReadyForm(),
      guests: '7',
      assignedUnits: [selectedT18],
      extraChairs: 1,
    })

    expect(container.querySelector('.mobile-host-quick-create-table-capacity-warning')).toBeNull()

    unmount()
  })

  it('still warns for Capacity 6 / Guests 8 when extra chair is active', () => {
    const { container, rerender, unmount } = renderField()

    rerender({
      ...buildReadyForm(),
      guests: '8',
      assignedUnits: [selectedT18],
      extraChairs: 1,
    })

    expect(container.querySelector('.mobile-host-quick-create-table-capacity-warning')?.textContent)
      .toContain('below party size by 1 guest')

    unmount()
  })
})
