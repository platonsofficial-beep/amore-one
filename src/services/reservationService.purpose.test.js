import { describe, expect, it } from 'vitest'
import {
  buildReservationUpdatePayload,
  mapReservationRecord,
  serializeReservationForPersistence,
} from './reservationService'
import { enrichReservationWithSeatingAssignment } from '../lib/seatingAssignment'
import { CUSTOMER_TYPE_MARKER } from '../lib/reservationCustomerType'
import { PURPOSE_MARKER } from '../lib/reservationPurpose'
import { mergeOptimisticReservationUpdate } from '../lib/hostFloorReservationState'

const LEGACY_DB_RECORD = {
  id: 'legacy-1',
  guest_name: 'Maria Georgiou',
  phone: '+35799111222',
  reservation_date: '2026-07-10',
  reservation_time: '20:00',
  party_size: 4,
  status: 'Confirmed',
  notes: 'Window seat',
  table_number: '12',
  area: 'Main Dining',
  seating_id: null,
}

function mapLegacyReservationFromDb(record = LEGACY_DB_RECORD) {
  return enrichReservationWithSeatingAssignment(mapReservationRecord(record))
}

function buildLegacyEditPatch(overrides = {}) {
  return {
    guestName: 'Maria Georgiou',
    phone: '+35799111222',
    date: '2026-07-10',
    time: '20:00',
    guests: '4',
    status: 'Confirmed',
    notes: 'Window seat',
    area: 'Main Dining',
    assignedUnits: [],
    extraChairs: 0,
    standingGuests: 0,
    seatingId: null,
    ...overrides,
  }
}

describe('buildReservationUpdatePayload reservation purpose', () => {
  it('defaults legacy reservations without a marker to dinner', () => {
    const legacy = mapLegacyReservationFromDb()
    expect(legacy.reservationPurpose).toBe('dinner')

    const payload = buildReservationUpdatePayload(legacy, buildLegacyEditPatch())
    expect(payload.reservationPurpose).toBe('dinner')
    expect(payload.notes).toBe('Window seat')
    expect(payload.notes).not.toContain('@@PURPOSE@@')
  })

  it('persists drinks through notes encoding on create and edit save', () => {
    const payload = buildReservationUpdatePayload(mapLegacyReservationFromDb(), {
      reservationPurpose: 'drinks',
      notes: 'Window seat',
    })

    expect(payload.reservationPurpose).toBe('drinks')
    expect(payload.notes).toContain(`Window seat${PURPOSE_MARKER}drinks`)
  })

  it('keeps guest type, walk-in, and seating metadata without duplication', () => {
    const payload = buildReservationUpdatePayload(
      mapLegacyReservationFromDb({
        ...LEGACY_DB_RECORD,
        status: 'Walk In',
        notes: `Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP`,
      }),
      {
        reservationPurpose: 'drinks',
        customerType: 'VIP',
        notes: 'Birthday table',
        status: 'Walk In',
      },
    )

    expect(payload.reservationPurpose).toBe('drinks')
    expect(payload.customerType).toBe('VIP')
    expect(payload.notes).toContain(`Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP${PURPOSE_MARKER}drinks`)
    expect((payload.notes.match(/@@PURPOSE@@/g) ?? []).length).toBe(1)
  })

  it('changing drinks to dinner removes the purpose marker after reload', () => {
    const legacyInState = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: `Window seat${PURPOSE_MARKER}drinks`,
    })
    expect(legacyInState.reservationPurpose).toBe('drinks')

    const payload = buildReservationUpdatePayload(legacyInState, buildLegacyEditPatch({
      reservationPurpose: 'dinner',
      notes: 'Window seat',
    }))
    const serialized = serializeReservationForPersistence({
      ...legacyInState,
      ...payload,
    })
    const reloaded = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: serialized.notes,
    })

    expect(reloaded.reservationPurpose).toBe('dinner')
    expect(reloaded.notes).not.toContain('@@PURPOSE@@')
  })

  it('repeated edits do not duplicate the internal purpose marker', () => {
    const legacyInState = mapLegacyReservationFromDb()
    const firstPayload = buildReservationUpdatePayload(legacyInState, buildLegacyEditPatch({
      reservationPurpose: 'drinks',
    }))
    const optimistic = mergeOptimisticReservationUpdate(legacyInState, buildLegacyEditPatch({
      reservationPurpose: 'drinks',
    }))
    const secondPayload = buildReservationUpdatePayload(optimistic, buildLegacyEditPatch({
      reservationPurpose: 'drinks',
      notes: 'Window seat',
    }))

    expect(firstPayload.notes).toContain(`${PURPOSE_MARKER}drinks`)
    expect((secondPayload.notes.match(/@@PURPOSE@@/g) ?? []).length).toBe(1)
    expect(optimistic.reservationPurpose).toBe('drinks')
  })
})
