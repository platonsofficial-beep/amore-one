import { describe, expect, it } from 'vitest'
import { getCompleteLocationDisabledReason } from './InventoryCountSessionWorkspace'

const base = { sessionStatus: 'in_progress', selectedLocation: { status: 'not_started', totalItems: 2, countedItems: 0 } }

describe('Complete location hint (S-19)', () => {
  it('keeps the existing copy outside phone landscape', () => {
    expect(getCompleteLocationDisabledReason({ ...base })).toBe('Complete “the current location” first.')
  })
  it('uses plain copy in phone landscape when no location is current', () => {
    expect(getCompleteLocationDisabledReason({ ...base, phoneLandscapeCopy: true })).toBe('Finish the location you’re on first.')
  })
  it('names the current location when known', () => {
    expect(getCompleteLocationDisabledReason({ ...base, currentLocationName: 'Main Storage', phoneLandscapeCopy: true })).toBe('Complete “Main Storage” first.')
  })
})
