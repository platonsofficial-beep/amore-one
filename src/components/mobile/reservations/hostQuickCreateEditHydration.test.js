import { describe, expect, it } from 'vitest'
import {
  buildQuickCreateEditHydration,
  splitGuestNameForQuickCreateEdit,
} from './hostQuickCreateEditHydration'

const LAYOUT = {
  zones: [{ id: 'main', label: 'Main Dining' }],
  units: [
    { id: 't18', label: 'T18', zoneId: 'main', seatedCapacity: 4, maxGuestCapacity: 4 },
  ],
}

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

describe('splitGuestNameForQuickCreateEdit', () => {
  it('splits first word into first name and remainder into last name', () => {
    expect(splitGuestNameForQuickCreateEdit('Kostantina Spanomitrou')).toEqual({
      firstName: 'Kostantina',
      lastName: 'Spanomitrou',
    })
  })

  it('splits multi-word last names correctly', () => {
    expect(splitGuestNameForQuickCreateEdit('John Michael Smith')).toEqual({
      firstName: 'John',
      lastName: 'Michael Smith',
    })
  })

  it('leaves last name empty for single-word legacy names', () => {
    expect(splitGuestNameForQuickCreateEdit('Platon')).toEqual({
      firstName: 'Platon',
      lastName: '',
    })
  })
})

describe('buildQuickCreateEditHydration', () => {
  const reservation = {
    id: 'res-1',
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

  it('hydrates quick create form fields from an existing reservation', () => {
    const hydration = buildQuickCreateEditHydration(reservation, LAYOUT, SEATINGS, '2026-07-10')

    expect(hydration.firstName).toBe('Kostantina')
    expect(hydration.lastName).toBe('Spanomitrou')
    expect(hydration.guestTitle).toBe('Kostantina Spanomitrou')
    expect(hydration.quickForm.phone).toBe('+306941234567')
    expect(hydration.quickForm.date).toBe('2026-07-10')
    expect(hydration.quickForm.time).toBe('21:00')
    expect(hydration.quickForm.guests).toBe('4')
    expect(hydration.quickForm.seatingId).toBe('dinner-2')
    expect(hydration.quickForm.seatingAreaId).toBe('main')
    expect(hydration.quickForm.area).toBe('Main Dining')
    expect(hydration.quickForm.notes).toBe('Window seat')
    expect(hydration.quickForm.status).toBe('Confirmed')
    expect(hydration.quickForm.customerType).toBe('VIP')
    expect(hydration.quickForm.extraChairs).toBe(1)
    expect(hydration.quickForm.assignedUnits.map((unit) => unit.id)).toEqual(['t18'])
  })

  it('hydrates guest type and notes from encoded notes marker only', () => {
    const hydration = buildQuickCreateEditHydration({
      ...reservation,
      customerType: undefined,
      notes: `Window seat\n@@CUSTOMER@@House Guest`,
    }, LAYOUT, SEATINGS, '2026-07-10')

    expect(hydration.quickForm.customerType).toBe('House Guest')
    expect(hydration.quickForm.notes).toBe('Window seat')
  })
})
