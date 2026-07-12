import { describe, expect, it } from 'vitest'
import {
  buildReservationUpdatePayload,
  mapReservationRecord,
  serializeReservationForPersistence,
} from './reservationService'
import { enrichReservationWithSeatingAssignment } from '../lib/seatingAssignment'
import { CUSTOMER_TYPE_MARKER } from '../lib/reservationCustomerType'
import { mergeOptimisticReservationUpdate } from '../lib/hostFloorReservationState'

const LEGACY_DB_RECORD = {
  id: 'legacy-1',
  guest_name: 'Old Guest',
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
    guestName: 'Old Guest',
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

describe('buildReservationUpdatePayload guest type', () => {
  it('persists VIP through notes encoding on edit save', () => {
    const payload = buildReservationUpdatePayload(mapLegacyReservationFromDb(), {
      customerType: 'VIP',
      notes: 'Window seat',
    })

    expect(payload.customerType).toBe('VIP')
    expect(payload.notes).toContain(`Window seat${CUSTOMER_TYPE_MARKER}VIP`)
  })

  it('persists VVIP and House Guest on edit save', () => {
    const legacy = mapLegacyReservationFromDb()

    const vvipPayload = buildReservationUpdatePayload(legacy, {
      customerType: 'VVIP',
      notes: 'Anniversary',
    })
    expect(vvipPayload.customerType).toBe('VVIP')
    expect(vvipPayload.notes).toContain(`${CUSTOMER_TYPE_MARKER}VVIP`)

    const houseGuestPayload = buildReservationUpdatePayload(legacy, {
      customerType: 'House Guest',
      notes: 'Chef table',
    })
    expect(houseGuestPayload.customerType).toBe('House Guest')
    expect(houseGuestPayload.notes).toContain(`${CUSTOMER_TYPE_MARKER}House Guest`)
  })

  it('keeps walk-in marker and customer type without duplication', () => {
    const payload = buildReservationUpdatePayload(
      mapLegacyReservationFromDb({
        ...LEGACY_DB_RECORD,
        status: 'Walk In',
        notes: `Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP`,
      }),
      {
        customerType: 'VVIP',
        notes: 'Birthday table',
        status: 'Walk In',
      },
    )

    expect(payload.customerType).toBe('VVIP')
    expect(payload.notes).toContain(`Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VVIP`)
  })

  it('preserves host notes while replacing encoded customer type', () => {
    const payload = buildReservationUpdatePayload(
      mapLegacyReservationFromDb({
        ...LEGACY_DB_RECORD,
        notes: `Allergic to nuts${CUSTOMER_TYPE_MARKER}VIP`,
      }),
      {
        customerType: 'House Guest',
        notes: 'Allergic to nuts',
      },
    )

    expect(payload.notes).toContain(`Allergic to nuts${CUSTOMER_TYPE_MARKER}House Guest`)
  })
})

describe('legacy edit persistence roundtrip', () => {
  it('legacy reservation without customerType field -> save VIP -> reload remains VIP', () => {
    const legacyInState = mapLegacyReservationFromDb()
    expect(legacyInState.customerType).toBe('Regular')
    expect(legacyInState.notes).toBe('Window seat')

    const patch = buildLegacyEditPatch({ customerType: 'VIP' })
    const payload = buildReservationUpdatePayload(legacyInState, patch)
    const serialized = serializeReservationForPersistence(payload)
    const reloaded = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: serialized.notes,
    })

    expect(serialized.notes).toBe(`Window seat${CUSTOMER_TYPE_MARKER}VIP`)
    expect(reloaded.customerType).toBe('VIP')
    expect(reloaded.notes).toBe('Window seat')
  })

  it('legacy reservation with VIP -> change to Normal removes customer marker', () => {
    const legacyInState = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: `Window seat${CUSTOMER_TYPE_MARKER}VIP`,
    })

    const patch = buildLegacyEditPatch({ customerType: 'Regular', notes: 'Window seat' })
    const payload = buildReservationUpdatePayload(legacyInState, patch)
    const serialized = serializeReservationForPersistence(payload)
    const reloaded = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: serialized.notes,
    })

    expect(serialized.notes).toBe('Window seat')
    expect(reloaded.customerType).toBe('Regular')
    expect(reloaded.notes).not.toContain('@@CUSTOMER@@')
  })

  it('legacy reservation with seating metadata preserves seating after guest type edit', () => {
    const seatingPayload = JSON.stringify({
      assignedUnits: [{ id: 't12', label: 'T12' }],
      extraChairs: 0,
      standingGuests: 0,
      totalSeatedCapacity: 4,
      totalGuestCapacity: 4,
    })
    const legacyInState = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: `Window seat\n@@SEATING@@${seatingPayload}`,
      table_number: 'T12',
    })

    const patch = buildLegacyEditPatch({
      customerType: 'VVIP',
      notes: 'Window seat',
      assignedUnits: [{ id: 't12', label: 'T12' }],
    })
    const payload = buildReservationUpdatePayload(legacyInState, patch)
    const serialized = serializeReservationForPersistence(payload)
    const reloaded = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: serialized.notes,
      table_number: 'T12',
    })

    expect(serialized.notes).toContain(`${CUSTOMER_TYPE_MARKER}VVIP`)
    expect(serialized.notes).toContain('@@SEATING@@')
    expect(reloaded.customerType).toBe('VVIP')
    expect(reloaded.notes).toBe('Window seat')
    expect(reloaded.seatingAssignment.assignedUnits.map((unit) => unit.label)).toEqual(['T12'])
  })

  it('optimistic and reloaded legacy states expose the same guest type', () => {
    const legacyInState = mapLegacyReservationFromDb()
    const patch = buildLegacyEditPatch({ customerType: 'House Guest' })
    const optimistic = mergeOptimisticReservationUpdate(legacyInState, patch)
    const serialized = serializeReservationForPersistence(
      buildReservationUpdatePayload(legacyInState, patch),
    )
    const reloaded = mapLegacyReservationFromDb({
      ...LEGACY_DB_RECORD,
      notes: serialized.notes,
    })

    expect(optimistic.customerType).toBe('House Guest')
    expect(reloaded.customerType).toBe('House Guest')
    expect(optimistic.customerType).toBe(reloaded.customerType)
  })

  it('persists exactly one customer marker after repeated legacy edits', () => {
    let dbNotes = 'Window seat'
    let legacyInState = mapLegacyReservationFromDb({ ...LEGACY_DB_RECORD, notes: dbNotes })

    for (const type of ['VIP', 'VVIP', 'House Guest', 'Regular', 'VIP']) {
      const patch = buildLegacyEditPatch({ customerType: type, notes: 'Window seat' })
      const payload = buildReservationUpdatePayload(legacyInState, patch)
      const serialized = serializeReservationForPersistence(payload)
      dbNotes = serialized.notes
      legacyInState = mapLegacyReservationFromDb({ ...LEGACY_DB_RECORD, notes: dbNotes })

      const markerMatches = dbNotes.match(/@@CUSTOMER@@/g) ?? []
      expect(markerMatches.length).toBeLessThanOrEqual(1)
      expect(legacyInState.customerType).toBe(type === 'Regular' ? 'Regular' : type)
    }
  })
})
