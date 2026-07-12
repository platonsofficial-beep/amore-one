/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const EDIT_RESERVATION = {
  id: 'res-edit-1',
  guestName: 'Kostantina Spanomitrou',
  phone: '+306941234567',
  date: '2026-07-10',
  time: '21:00',
  guests: 4,
  status: 'Confirmed',
  customerType: 'VIP',
  notes: 'Window seat',
  area: 'Main Dining',
  seatingAssignment: {
    assignedUnits: [{ id: 't18', label: 'T18', zoneId: 'main' }],
    extraChairs: 1,
    standingGuests: 0,
  },
}

const SECOND_EDIT_RESERVATION = {
  id: 'res-edit-2',
  guestName: 'Platon',
  phone: '',
  date: '2026-07-10',
  time: '21:00',
  guests: 2,
  status: 'Pending',
  customerType: 'Regular',
  notes: '',
  area: 'Main Dining',
  seatingAssignment: {
    assignedUnits: [{ id: 't13', label: 'T13', zoneId: 'main' }],
    extraChairs: 0,
    standingGuests: 0,
  },
}

function renderEditSheet({
  onSubmit = vi.fn(async () => true),
  onClose = vi.fn(),
  reservation = EDIT_RESERVATION,
  ...props
} = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationQuickCreateSheet, {
      isOpen: true,
      mode: 'edit',
      variant: 'inline',
      todayKey: '2026-07-10',
      reservation,
      seatings: SEATINGS,
      reservations: [reservation],
      onClose,
      onSubmit,
      ...props,
    }))
  })

  return {
    container,
    onSubmit,
    onClose,
    rerender: (nextProps = {}) => {
      act(() => {
        root.render(createElement(MobileReservationQuickCreateSheet, {
          isOpen: true,
          mode: 'edit',
          variant: 'inline',
          todayKey: '2026-07-10',
          reservation,
          seatings: SEATINGS,
          reservations: [reservation],
          onClose,
          onSubmit,
          ...props,
          ...nextProps,
        }))
      })
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderCreateSheet({ onSubmit = vi.fn(async () => true), onClose = vi.fn(), ...props } = {}) {
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
      onClose,
      onSubmit,
      ...props,
    }))
  })

  return { container, onSubmit, onClose, root, unmount: () => {
    act(() => root.unmount())
    container.remove()
  } }
}

async function clickPrimaryAction(container) {
  const button = container.querySelector('[data-testid="host-quick-create-primary-action"]')
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('MobileReservationQuickCreateSheet edit mode', () => {
  it('opens in edit mode with EDIT RESERVATION eyebrow and Save changes action', () => {
    const { container, unmount } = renderEditSheet()

    expect(container.querySelector('[data-testid="host-quick-create-edit-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toMatch(/edit reservation/i)
    expect(container.querySelector('[data-testid="host-quick-create-primary-action"]')?.textContent)
      .toBe('Save changes')
    expect(container.querySelector('.mobile-host-form-hint')).toBeNull()

    unmount()
  })

  it('prefills split guest name fields from the reservation', () => {
    const { container, unmount } = renderEditSheet()

    expect(container.querySelector('input[autocomplete="given-name"]')?.value).toBe('Kostantina')
    expect(container.querySelector('input[autocomplete="family-name"]')?.value).toBe('Spanomitrou')

    unmount()
  })

  it('prefills phone, date, time, and party size', () => {
    const { container, unmount } = renderEditSheet()

    expect(container.querySelector('input[type="number"]')?.value).toBe('4')
    expect(container.querySelector('[data-testid="host-quick-create-seating"]')?.value).toBe('dinner-2')
    expect(container.querySelector('[data-testid="host-quick-create-area"]')?.value).toBe('main')
    expect(container.querySelector('textarea')?.value).toBe('Window seat')

    unmount()
  })

  it('shows existing selected tables and active extra chair state', () => {
    const { container, unmount } = renderEditSheet()

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected table · T18')
    expect(container.querySelector('[data-testid="host-quick-create-table-option-t18"]')?.className)
      .toContain('is-selected')
    expect(container.querySelector('[data-testid="host-quick-create-extra-chair-toggle"]')?.className)
      .toContain('is-active')

    unmount()
  })

  it('prefills status and guest type in edit-only fields', () => {
    const { container, unmount } = renderEditSheet()

    expect(container.querySelector('[data-testid="host-quick-create-status"]')?.value).toBe('Confirmed')
    expect(container.querySelector('[data-testid="host-quick-create-customer-type"]')?.value).toBe('VIP')
    expect(container.querySelector('[data-testid="host-quick-create-customer-type"]')?.selectedOptions[0]?.textContent)
      .toBe('VIP')

    unmount()
  })

  it('displays Regular reservations as Normal in guest type select', () => {
    const { container, unmount } = renderEditSheet({
      reservation: SECOND_EDIT_RESERVATION,
    })

    expect(container.querySelector('[data-testid="host-quick-create-customer-type"]')?.value).toBe('Regular')
    expect(container.querySelector('[data-testid="host-quick-create-customer-type"]')?.selectedOptions[0]?.textContent)
      .toBe('Normal')

    unmount()
  })

  it('calls update handler with reservation id and preserved status and customer type when unchanged', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderEditSheet({ onSubmit })

    await clickPrimaryAction(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].id).toBe('res-edit-1')
    expect(onSubmit.mock.calls[0][1].status).toBe('Confirmed')
    expect(onSubmit.mock.calls[0][1].customerType).toBe('VIP')
    expect(onSubmit.mock.calls[0][1].guestName).toBe('Kostantina Spanomitrou')
    expect(onSubmit.mock.calls[0][1].extraChairs).toBe(1)
    expect(onSubmit.mock.calls[0][1].assignedUnits.map((unit) => unit.id)).toEqual(['t18'])

    unmount()
  })

  it('does not call create-style submit signature in edit mode', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderEditSheet({ onSubmit })

    await clickPrimaryAction(container)

    expect(onSubmit.mock.calls[0]).toHaveLength(3)
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 'res-edit-1' }))

    unmount()
  })

  it('allows saving single-word legacy guest names without a last name', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderEditSheet({
      onSubmit,
      reservation: SECOND_EDIT_RESERVATION,
    })

    expect(container.querySelector('input[autocomplete="given-name"]')?.value).toBe('Platon')
    expect(container.querySelector('input[autocomplete="family-name"]')?.value).toBe('')

    await clickPrimaryAction(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][1].guestName).toBe('Platon')

    unmount()
  })

  it('cancel closes without calling update', async () => {
    const onSubmit = vi.fn(async () => true)
    const onClose = vi.fn()
    const { container, unmount } = renderEditSheet({ onSubmit, onClose })

    const cancelButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Cancel')

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('close X closes without calling update', async () => {
    const onSubmit = vi.fn(async () => true)
    const onClose = vi.fn()
    const { container, unmount } = renderEditSheet({ onSubmit, onClose })

    const closeButton = container.querySelector('.mobile-sheet-close-btn')

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('clears edit state after close so a new reservation opens blank', async () => {
    const onClose = vi.fn()
    const { container, root, unmount } = renderCreateSheet({ onClose })

    act(() => {
      root.render(createElement(MobileReservationQuickCreateSheet, {
        isOpen: true,
        mode: 'edit',
        variant: 'inline',
        todayKey: '2026-07-10',
        reservation: EDIT_RESERVATION,
        seatings: SEATINGS,
        reservations: [EDIT_RESERVATION],
        onClose,
        onSubmit: vi.fn(async () => true),
      }))
    })

    expect(container.querySelector('input[autocomplete="given-name"]')?.value).toBe('Kostantina')

    act(() => {
      root.render(createElement(MobileReservationQuickCreateSheet, {
        isOpen: false,
        mode: 'edit',
        variant: 'inline',
        todayKey: '2026-07-10',
        reservation: EDIT_RESERVATION,
        seatings: SEATINGS,
        reservations: [EDIT_RESERVATION],
        onClose,
        onSubmit: vi.fn(async () => true),
      }))
    })

    act(() => {
      root.render(createElement(MobileReservationQuickCreateSheet, {
        isOpen: true,
        variant: 'inline',
        todayKey: '2026-07-10',
        seatings: SEATINGS,
        reservations: [],
        onClose: vi.fn(),
        onSubmit: vi.fn(async () => true),
      }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-create-panel"]')).not.toBeNull()
    expect(container.querySelector('input[autocomplete="given-name"]')?.value).toBe('')
    expect(container.querySelector('input[autocomplete="family-name"]')?.value).toBe('')

    unmount()
  })

  it('does not leak values when switching between two edited reservations', () => {
    const { container, rerender, unmount } = renderEditSheet({ reservation: EDIT_RESERVATION })

    expect(container.querySelector('input[autocomplete="given-name"]')?.value).toBe('Kostantina')

    rerender({
      reservation: SECOND_EDIT_RESERVATION,
      reservations: [SECOND_EDIT_RESERVATION],
    })

    expect(container.querySelector('input[autocomplete="given-name"]')?.value).toBe('Platon')
    expect(container.querySelector('[data-testid="host-quick-create-status"]')?.value).toBe('Pending')
    expect(container.querySelector('textarea')?.value).toBe('')

    unmount()
  })

  it('submits changed guest type on save changes', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderEditSheet({ onSubmit })

    act(() => {
      const select = container.querySelector('[data-testid="host-quick-create-customer-type"]')
      select.value = 'House Guest'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await clickPrimaryAction(container)

    expect(onSubmit.mock.calls[0][1].customerType).toBe('House Guest')

    unmount()
  })

  it('reopens edit with saved guest type and hidden notes marker', () => {
    const { container, unmount } = renderEditSheet({
      reservation: {
        ...EDIT_RESERVATION,
        customerType: undefined,
        notes: 'Window seat\n@@CUSTOMER@@VIP',
      },
    })

    expect(container.querySelector('[data-testid="host-quick-create-customer-type"]')?.value).toBe('VIP')
    expect(container.querySelector('textarea')?.value).toBe('Window seat')

    unmount()
  })
})

describe('MobileReservationQuickCreateSheet create mode regression', () => {
  it('keeps new reservation quick create flow functional', () => {
    const { container, unmount } = renderCreateSheet()

    expect(container.querySelector('[data-testid="host-quick-create-create-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toMatch(/new reservation/i)
    expect(container.querySelector('[data-testid="host-quick-create-primary-action"]')?.textContent)
      .toBe('Save reservation')
    expect(container.querySelector('[data-testid="host-quick-create-status"]')).toBeNull()
    expect(container.querySelector('.mobile-host-form-hint')).not.toBeNull()

    unmount()
  })
})
