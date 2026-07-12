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
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
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

async function clickSeatNow(container) {
  await act(async () => {
    container.querySelector('[data-testid="host-quick-create-primary-action"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function renderWalkInSheet({ onSubmit = vi.fn(async () => true), prefill = { date: '2026-07-10', time: '21:00' }, ...props } = {}) {
  return renderSheet({
    mode: 'walk-in',
    prefill,
    onSubmit,
    ...props,
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

describe('MobileReservationQuickCreateSheet walk-in mode', () => {
  it('shows walk-in header copy and Seat Now primary action', () => {
    const { container, unmount } = renderSheet({
      mode: 'walk-in',
      prefill: { date: '2026-07-10', time: '12:00' },
    })

    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toBe('NEW WALK-IN')
    expect(container.querySelector('.mobile-host-reservation-panel-title')?.textContent)
      .toBe('Quick create')
    expect(container.querySelector('[data-testid="host-quick-create-primary-action"]')?.textContent)
      .toBe('Seat Now')
    expect(container.querySelector('.mobile-host-form-hint')?.textContent ?? '')
      .not.toContain('Pending status')

    unmount()
  })

  it('prefills viewed date and rounded 15-minute time', () => {
    const { container, unmount } = renderSheet({
      mode: 'walk-in',
      prefill: { date: '2026-07-11', time: '12:15' },
    })

    expect(container.querySelector('[data-testid="host-quick-create-time-trigger"]')?.textContent)
      .toContain('12:15')

    unmount()
  })

  it('submits walk-in payload with walkIn flag and preserves table assignment', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      mode: 'walk-in',
      prefill: {
        date: '2026-07-10',
        time: '21:00',
        assignedUnits: [{ id: 't18', label: 'T18', seatedCapacity: 4, maxGuestCapacity: 4 }],
        seatingAreaId: 'main',
        area: 'Main Dining',
        seatingId: 'dinner-2',
      },
      onSubmit,
    })

    fillGuestName(container)
    act(() => {
      setInputValue(container.querySelector('textarea'), 'Birthday table')
    })

    await act(async () => {
      container.querySelector('[data-testid="host-quick-create-primary-action"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      walkIn: true,
      guestName: 'Alex Rivera',
      date: '2026-07-10',
      time: '21:00',
      notes: 'Birthday table',
      assignedUnits: [{ id: 't18', label: 'T18', seatedCapacity: 4, maxGuestCapacity: 4 }],
    })

    unmount()
  })

  it('allows walk-in submit without a table when validation passes', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      mode: 'walk-in',
      prefill: { date: '2026-07-10', time: '21:00' },
      onSubmit,
    })

    fillGuestName(container)

    await act(async () => {
      container.querySelector('[data-testid="host-quick-create-primary-action"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].assignedUnits).toEqual([])

    unmount()
  })

  it('keeps standard create mode unchanged', () => {
    const { container, unmount } = renderSheet({
      mode: 'create',
      prefill: { time: '21:00' },
    })

    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toBe('New reservation')
    expect(container.querySelector('[data-testid="host-quick-create-primary-action"]')?.textContent)
      .toBe('Save reservation')
    expect(container.querySelector('.mobile-host-form-hint')?.textContent)
      .toContain('Pending status')

    unmount()
  })

  it('keeps standard create submit payload without walkIn flag', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      mode: 'create',
      prefill: { time: '21:00' },
      onSubmit,
    })

    fillGuestName(container)

    await act(async () => {
      container.querySelector('[data-testid="host-quick-create-primary-action"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].walkIn).toBeUndefined()

    unmount()
  })

  it('disables duplicate submit while saving', () => {
    const { container, unmount } = renderSheet({
      mode: 'walk-in',
      prefill: { date: '2026-07-10', time: '12:00' },
      isSaving: true,
    })

    const saveButton = container.querySelector('[data-testid="host-quick-create-primary-action"]')
    expect(saveButton?.disabled).toBe(true)
    expect(saveButton?.textContent).toBe('Saving…')

    unmount()
  })
})

describe('MobileReservationQuickCreateSheet walk-in name validation', () => {
  it('submits with first name only', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderWalkInSheet({ onSubmit })

    fillGuestName(container, 'Poponis', '')
    await clickSeatNow(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].guestName).toBe('Poponis')

    unmount()
  })

  it('submits with last name only', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderWalkInSheet({ onSubmit })

    fillGuestName(container, '', 'Psilos')
    await clickSeatNow(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].guestName).toBe('Psilos')

    unmount()
  })

  it('submits with both names', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderWalkInSheet({ onSubmit })

    fillGuestName(container, 'Poponis', 'Psilos')
    await clickSeatNow(container)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].guestName).toBe('Poponis Psilos')

    unmount()
  })

  it('blocks submit when both names are empty or whitespace-only', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderWalkInSheet({ onSubmit })

    fillGuestName(container, '', '')
    await clickSeatNow(container)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelector('.mobile-host-reservations-notice')?.textContent)
      .toBe('Please provide at least a first name or last name')

    fillGuestName(container, '   ', '  ')
    await clickSeatNow(container)

    expect(onSubmit).not.toHaveBeenCalled()

    unmount()
  })

  it('keeps standard create validation unchanged', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      mode: 'create',
      prefill: { time: '21:00' },
      onSubmit,
    })

    fillGuestName(container, 'Poponis', '')
    await clickSeatNow(container)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelector('.mobile-host-reservations-notice')?.textContent)
      .toBe('Please provide the guest name.')

    fillGuestName(container, '', 'Psilos')
    await clickSeatNow(container)
    expect(onSubmit).not.toHaveBeenCalled()

    unmount()
  })
})
