import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = []
let failFirst = false
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (body) => {
        calls.push(body)
        const chain = {
          eq: () => chain,
          select: () => chain,
          single: async () => {
            if (failFirst && calls.length === 1) {
              return { data: null, error: { message: "Could not find the 'seated_guests' column of 'reservations' in the schema cache" } }
            }
            const { seated_guests: _s, ...row } = body
            return { data: { id: 'r1', ...row }, error: null }
          },
        }
        return chain
      },
    }),
  },
}))

import { updateReservation } from './reservationService'

describe('updateReservation seated_guests fallback (Platon t453u)', () => {
  beforeEach(() => { calls.length = 0 })

  it('retries without seated_guests when the column is missing, keeping the status', async () => {
    failFirst = true
    const saved = await updateReservation('w1', 'r1', { guestName: 'A', guests: 4, status: 'Checked In (Partial)', seatedGuests: 2, notes: '' })
    expect(calls).toHaveLength(2)
    expect(calls[0].seated_guests).toBe(2)
    expect(Object.hasOwn(calls[1], 'seated_guests')).toBe(false)
    expect(calls[1].status).toBe('Checked In (Partial)')
    expect(saved.status).toBe('Checked In (Partial)')
  })
})
