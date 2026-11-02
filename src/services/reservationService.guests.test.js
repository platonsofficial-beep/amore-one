import { describe, expect, it } from 'vitest'
import { serializeReservationForPersistence } from './reservationService'

describe('reservation guests column', () => {
  it('writes the party size to both party_size and the legacy guests column', () => {
    const row = serializeReservationForPersistence({
      guestName: 'TEST Big', date: '2026-11-02', time: '20:30', guests: '8', status: 'Pending',
    })
    expect(row.party_size).toBe(8)
    expect(row.guests).toBe(8)
  })
})
