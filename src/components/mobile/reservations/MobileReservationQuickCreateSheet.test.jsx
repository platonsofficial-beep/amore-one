/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationQuickCreateSheet } from './MobileReservationQuickCreateSheet'

vi.mock('../../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({
    layout: {
      zones: [{ id: 'main', label: 'Main Dining' }],
      units: [
        { id: 't18', label: 'T18', zoneId: 'main', seatedCapacity: 4, maxGuestCapacity: 4 },
        { id: 't13', label: 'T13', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 2 },
      ],
    },
  }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

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

function setInputValue(input, value) {
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function fillGuestName(container, firstName = 'Alex', lastName = 'Rivera') {
  act(() => {
    setInputValue(container.querySelector('input[autocomplete="given-name"]'), firstName)
    setInputValue(container.querySelector('input[autocomplete="family-name"]'), lastName)
  })
}

function selectGuestType(container, value) {
  act(() => {
    const select = container.querySelector('[data-testid="host-quick-create-customer-type"]')
    if (!select) return
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function getGuestTypeSelect(container) {
  return container.querySelector('[data-testid="host-quick-create-customer-type"]')
}

function getPurposeSelect(container) {
  return container.querySelector('[data-testid="host-quick-create-purpose"]')
}

function selectPurpose(container, value) {
  act(() => {
    const select = getPurposeSelect(container)
    if (!select) return
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickSaveReservation(container) {
  const saveButton = [...container.querySelectorAll('button')]
    .find((button) => button.textContent === 'Save reservation')

  await act(async () => {
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function renderSheet({ onSubmit = vi.fn(async () => true), ...props } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationQuickCreateSheet, {
      isOpen: true,
      variant: 'inline',
      todayKey: '2026-07-10',
      seatings: SEATINGS,
      reservations: [],
      onClose: vi.fn(),
      onSubmit,
      ...props,
    }))
  })

  return {
    container,
    onSubmit,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MobileReservationQuickCreateSheet table picker integration', () => {
  it('does not render Recommended in the closed seating field', () => {
    const { container, unmount } = renderSheet({
      prefill: { time: '21:00' },
    })

    const seatingSelect = container.querySelector('[data-testid="host-quick-create-seating"]')
    expect(seatingSelect).toBeTruthy()
    expect(seatingSelect?.value).toBe('dinner-2')
    expect(seatingSelect?.selectedOptions[0]?.textContent).toBe('Dinner 2 · 21:00–23:00')
    expect(seatingSelect?.selectedOptions[0]?.textContent).not.toContain('Recommended')

    unmount()
  })

  it('selects a table and passes assignedUnits to Save Reservation', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      prefill: {
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
      },
      onSubmit,
    })

    const t18Button = [...container.querySelectorAll('.mobile-host-quick-create-table-option')]
      .find((button) => button.textContent?.includes('T18'))

    await act(async () => {
      t18Button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected table · T18')

    fillGuestName(container)

    await clickSaveReservation(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].assignedUnits).toHaveLength(1)
    expect(onSubmit.mock.calls[0][0].assignedUnits[0].id).toBe('t18')

    unmount()
  })

  it('selects multiple tables and passes all assignedUnits to Save Reservation', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      prefill: {
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '4',
      },
      onSubmit,
    })

    const findButton = (label) => [...container.querySelectorAll('.mobile-host-quick-create-table-option')]
      .find((button) => button.textContent?.includes(label))

    await act(async () => {
      findButton('T13')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      findButton('T18')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected tables · T13 + T18')

    fillGuestName(container)

    await clickSaveReservation(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].assignedUnits.map((unit) => unit.id)).toEqual(['t13', 't18'])

    unmount()
  })

  it('keeps a selected table after availability refresh with unchanged canonical data', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      prefill: {
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '4',
      },
      onSubmit,
    })

    const t18Button = [...container.querySelectorAll('.mobile-host-quick-create-table-option')]
      .find((button) => button.textContent?.includes('T18'))

    await act(async () => {
      t18Button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected table · T18')
    expect(container.querySelector('.mobile-host-form-notice')).toBeNull()
    expect(container.querySelector('.mobile-host-form-hint')?.textContent ?? '').not.toContain('No available tables')

    unmount()
  })
})

describe('MobileReservationQuickCreateSheet guest name fields', () => {
  it('renders separate first and last name fields side by side', () => {
    const { container, unmount } = renderSheet()

    expect(container.querySelector('input[autocomplete="given-name"]')).not.toBeNull()
    expect(container.querySelector('input[autocomplete="family-name"]')).not.toBeNull()
    expect(container.querySelector('input[autocomplete="name"]')).toBeNull()
    expect(container.querySelector('.mobile-host-form-row input[autocomplete="given-name"]')).not.toBeNull()

    unmount()
  })

  it('combines first and last name into guestName on save', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({ onSubmit })

    fillGuestName(container, 'Maria', 'Costa')
    await clickSaveReservation(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].guestName).toBe('Maria Costa')

    unmount()
  })

  it('blocks save and shows validation when either name field is empty', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({ onSubmit })

    fillGuestName(container, 'Maria', '')
    await clickSaveReservation(container)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelector('.mobile-host-reservations-notice')?.textContent)
      .toBe('Please provide the guest name.')

    unmount()
  })
})

describe('MobileReservationQuickCreateSheet extra chair', () => {
  const tablePrefill = {
    time: '21:00',
    seatingId: 'dinner-2',
    seatingAreaId: 'main',
    area: 'Main Dining',
  }

  async function selectTable(container, label = 'T18') {
    const tableButton = [...container.querySelectorAll('.mobile-host-quick-create-table-option')]
      .find((button) => button.textContent?.includes(label))

    await act(async () => {
      tableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('submits extraChairs on the form when active', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({ onSubmit, prefill: tablePrefill })

    fillGuestName(container)
    await selectTable(container)

    const toggle = container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')
    expect(toggle).not.toBeNull()

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await clickSaveReservation(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].extraChairs).toBe(1)

    unmount()
  })

  it('resets extra chair state after successful save', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({ onSubmit, prefill: tablePrefill })

    fillGuestName(container)
    await selectTable(container)

    const toggle = container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')
    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await clickSaveReservation(container)

    expect(container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')).toBeNull()

    unmount()
  })
})

describe('MobileReservationQuickCreateSheet guest type', () => {
  it('defaults new reservation guest type to Normal', () => {
    const { container, unmount } = renderSheet()

    expect(getGuestTypeSelect(container)?.value).toBe('Regular')
    expect(getGuestTypeSelect(container)?.selectedOptions[0]?.textContent).toBe('Normal')

    unmount()
  })

  it('submits selected guest type with create payload', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({ onSubmit })

    selectGuestType(container, 'House Guest')
    fillGuestName(container)

    await clickSaveReservation(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].customerType).toBe('House Guest')
    expect(onSubmit.mock.calls[0][0].walkIn).toBeUndefined()

    unmount()
  })

  it('does not add phone lookup or guest history behavior', () => {
    const { container, unmount } = renderSheet()

    expect(container.querySelector('[data-testid="guest-history-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="guest-phone-lookup"]')).toBeNull()

    unmount()
  })
})

describe('MobileReservationQuickCreateSheet reservation purpose', () => {
  it('defaults new reservation purpose to Dinner', () => {
    const { container, unmount } = renderSheet()

    expect(getPurposeSelect(container)?.value).toBe('dinner')
    expect(getPurposeSelect(container)?.selectedOptions[0]?.textContent).toBe('🍽️ Dinner')

    unmount()
  })

  it('submits selected drinks purpose with create payload', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({ onSubmit })

    selectPurpose(container, 'drinks')
    fillGuestName(container)

    await clickSaveReservation(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].reservationPurpose).toBe('drinks')

    unmount()
  })
})
