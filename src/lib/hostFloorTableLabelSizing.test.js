import { describe, expect, it } from 'vitest'
import {
  buildHostFloorCompactTableContent,
  formatHostFloorTableLabel,
  HOST_FLOOR_CONTENT_TIERS,
  resolveHostFloorTableLabelLengthClass,
  resolveHostFloorTableContentTier,
} from './hostFloorTableContent'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Guest',
    date: '2026-07-09',
    time: '20:30',
    guests: 4,
    status: 'Confirmed',
    ...overrides,
  }
}

describe('resolveHostFloorTableLabelLengthClass', () => {
  it('uses medium sizing for four-character table ids', () => {
    expect(resolveHostFloorTableLabelLengthClass('T103')).toBe('is-id-medium')
  })

  it('uses extra-long sizing for very small occupied tables with four-character ids', () => {
    expect(resolveHostFloorTableLabelLengthClass('T109', HOST_FLOOR_CONTENT_TIERS.VERY_SMALL))
      .toBe('is-id-extra-long')
  })

  it('uses long sizing for five-character table ids on normal tables', () => {
    expect(resolveHostFloorTableLabelLengthClass('T1099')).toBe('is-id-long')
  })
})

describe('buildHostFloorCompactTableContent long table ids', () => {
  const roundTable = {
    id: 't109',
    label: '109',
    displayLabel: 'T109',
    widthPercent: 6,
    heightPercent: 6,
    seats: 4,
  }

  it('renders T109 without truncation markers', () => {
    const reservation = buildReservation({ time: '20:30', guests: 4 })
    const operational = resolveFloorTableOperationalState([reservation], 1230, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: roundTable,
      operational,
      displayReservation: reservation,
    })

    expect(formatHostFloorTableLabel(roundTable)).toBe('T109')
    expect(content.tableLabel).toBe('T109')
    expect(content.tableLabel).not.toContain('...')
    expect(content.tableLabelClass).toBe('is-id-extra-long')
    expect(content.timeLabel).toBe('20:30')
    expect(content.partyLabel).toBe('👤4')
  })

  it('renders T110 without truncation markers', () => {
    const reservation = buildReservation({
      time: '21:15',
      guests: 2,
    })
    const table = { ...roundTable, id: 't110', label: '110', displayLabel: 'T110' }
    const operational = resolveFloorTableOperationalState([reservation], 1275, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table,
      operational,
      displayReservation: reservation,
    })

    expect(content.tableLabel).toBe('T110')
    expect(content.tableLabel).not.toContain('...')
    expect(content.timeLabel).toBe('21:15')
  })

  it('classifies circular occupied tables by dimension tier', () => {
    expect(resolveHostFloorTableContentTier(roundTable)).toBe(HOST_FLOOR_CONTENT_TIERS.VERY_SMALL)
  })
})
