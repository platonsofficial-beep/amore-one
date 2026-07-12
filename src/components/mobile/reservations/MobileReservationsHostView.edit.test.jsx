/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationsHostView } from './MobileReservationsHostView'

const splitViewportMock = vi.hoisted(() => ({
  isSplit: true,
}))

vi.mock('../../../lib/mobileHostReservationUtils', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isMobileHostSplitViewport: () => splitViewportMock.isSplit,
  }
})

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

const RESERVATION = {
  id: 'res-host-1',
  guestName: 'Alex Rivera',
  phone: '+306941111111',
  date: '2026-07-10',
  time: '21:00',
  guests: 2,
  status: 'Confirmed',
  customerType: 'Regular',
  notes: '',
  area: 'Main Dining',
  seatingAssignment: {
    assignedUnits: [{ id: 't18', label: 'T18', zoneId: 'main' }],
    extraChairs: 0,
    standingGuests: 0,
  },
}

const SEATINGS = [{
  id: 'dinner-2',
  name: 'Dinner 2',
  start_time: '21:00',
  duration_minutes: 120,
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  sort_order: 0,
  is_active: true,
}]

function renderHostView(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationsHostView, {
      reservations: [RESERVATION],
      todayKey: '2026-07-10',
      nowMinutes: 720,
      canEditFloorPlan: true,
      hasLayout: true,
      reservationSeatings: SEATINGS,
      onHostEditSave: vi.fn(async () => ({ saved: true })),
      onCreateReservation: vi.fn(async () => true),
      ...props,
    }))
  })

  return { container, unmount: () => {
    act(() => root.unmount())
    container.remove()
  } }
}

async function openEditFromRowMenu(container) {
  const moreButton = container.querySelector('.host-reservation-card-row-menu')
  expect(moreButton).not.toBeNull()

  await act(async () => {
    moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  const editMenuItem = [...document.querySelectorAll('button')]
    .find((button) => button.textContent === 'Edit reservation')
  expect(editMenuItem).toBeTruthy()

  await act(async () => {
    editMenuItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('MobileReservationsHostView edit reservation routing', () => {
  beforeEach(() => {
    splitViewportMock.isSplit = true
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  it('opens Quick Create in edit mode when Edit reservation is selected from the row menu', async () => {
    const { container, unmount } = renderHostView()

    await openEditFromRowMenu(container)

    expect(container.querySelector('[data-testid="host-quick-create-edit-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toMatch(/edit reservation/i)
    expect(container.querySelector('[data-testid="host-quick-create-primary-action"]')?.textContent)
      .toBe('Save changes')

    unmount()
  })

  it('routes save to onHostEditSave instead of onCreateReservation', async () => {
    const onHostEditSave = vi.fn(async () => ({ saved: true }))
    const onCreateReservation = vi.fn(async () => true)
    const { container, unmount } = renderHostView({ onHostEditSave, onCreateReservation })

    await openEditFromRowMenu(container)

    const saveButton = container.querySelector('[data-testid="host-quick-create-primary-action"]')
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onHostEditSave).toHaveBeenCalledTimes(1)
    expect(onHostEditSave.mock.calls[0][0].id).toBe('res-host-1')
    expect(onCreateReservation).not.toHaveBeenCalled()

    unmount()
  })
})
