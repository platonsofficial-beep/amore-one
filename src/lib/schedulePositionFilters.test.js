import { describe, expect, it } from 'vitest'
import { buildSchedulePositionFilterOptions } from './scheduleDropUtils'

describe('buildSchedulePositionFilterOptions', () => {
  it('includes positions in use on employees even when they are missing from the catalog', () => {
    const options = buildSchedulePositionFilterOptions({
      positions: [{ name: 'Waiter' }],
      shifts: [],
      employees: [{
        primaryPosition: 'Bartender',
        positions: [{ name: 'Bartender' }],
      }],
    })

    expect(options).toEqual(['All', 'Bartender', 'Waiter'])
  })
})