import { describe, expect, it } from 'vitest'
import {
  formatHostQueueTimeGroupLabel,
  groupHostQueueReservationsByTime,
  shouldGroupHostQueueByTime,
} from './hostQueueTimeGroups'

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Alex',
    time: '20:00',
    ...overrides,
  }
}

describe('hostQueueTimeGroups', () => {
  it('groups reservations by exact time for earliest-first sort', () => {
    const reservations = [
      buildReservation({ id: 'a', time: '20:00' }),
      buildReservation({ id: 'b', time: '20:30' }),
      buildReservation({ id: 'c', time: '20:00' }),
    ]

    const groups = groupHostQueueReservationsByTime(reservations, 'time-asc')

    expect(groups?.map((group) => group.timeLabel)).toEqual(['20:00', '20:30'])
    expect(groups?.[0].count).toBe(2)
    expect(groups?.[1].count).toBe(1)
  })

  it('reverses time-group order for latest-first sort', () => {
    const reservations = [
      buildReservation({ id: 'a', time: '20:00' }),
      buildReservation({ id: 'b', time: '21:00' }),
      buildReservation({ id: 'c', time: '20:30' }),
    ]

    const groups = groupHostQueueReservationsByTime(reservations, 'time-desc')

    expect(groups?.map((group) => group.timeLabel)).toEqual(['21:00', '20:30', '20:00'])
  })

  it('does not group for table sort', () => {
    expect(groupHostQueueReservationsByTime([buildReservation()], 'table')).toBeNull()
    expect(shouldGroupHostQueueByTime('table')).toBe(false)
  })

  it('does not group for name sort', () => {
    expect(groupHostQueueReservationsByTime([buildReservation()], 'name-asc')).toBeNull()
    expect(shouldGroupHostQueueByTime('name-asc')).toBe(false)
  })

  it('formats compact time-group labels', () => {
    expect(formatHostQueueTimeGroupLabel('20:00')).toBe('20:00')
    expect(formatHostQueueTimeGroupLabel('__unscheduled__')).toBe('No time')
  })
})
