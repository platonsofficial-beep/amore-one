import { describe, expect, it } from 'vitest'
import { formatHostFloorCapacityLabel, formatHostFloorPartyLabel } from './hostFloorTableLabels'

describe('hostFloorTableLabels', () => {
  it('renders compact guest counts without truncating guests text', () => {
    expect(formatHostFloorPartyLabel(4)).toBe('4 pax')
    expect(formatHostFloorPartyLabel(2)).toBe('2 pax')
    expect(formatHostFloorPartyLabel(4)).not.toContain('guests')
  })

  it('renders compact capacity labels for available tables', () => {
    expect(formatHostFloorCapacityLabel({ minGuests: 2, maxGuestCapacity: 4 })).toBe('2-4 pax')
    expect(formatHostFloorCapacityLabel({ maxGuestCapacity: 6 })).toBe('6 pax')
  })
})
