/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { createElement, act } from 'react'
import { buildSeatingsById } from './reservationSeatings'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'
import {
  applyHostFloorSelectedSeatingContext,
  resolveHostFloorSemanticClass,
  resolveHostFloorVisualPresentation,
} from './hostFloorTableVisualState'
import {
  buildHostFloorCompactTableContent,
  formatHostFloorTableLabel,
  hostFloorCompactContentIncludesStatusWords,
  resolveHostFloorTableContentTier,
  HOST_FLOOR_CONTENT_TIERS,
} from './hostFloorTableContent'
import {
  HOST_FLOOR_PLAN_LEGEND_ITEMS,
} from './hostFloorPlanLegend'
import {
  HOST_FLOOR_SEMANTIC_CSS_VARS,
  HOST_FLOOR_SEMANTIC_TOKENS,
  resolveHostFloorLegendToneToken,
} from './hostFloorSemanticTokens'
import { HostFloorCompactTableContent } from '../components/floor/HostFloorCompactTableContent'

const SEATINGS = buildSeatingsById([
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    startTime: '19:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    startTime: '21:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 1,
    isActive: true,
  },
])

const TABLE = {
  id: 't11',
  label: '11',
  displayLabel: 'T11',
  seats: 4,
  maxGuestCapacity: 4,
  widthPercent: 8,
  heightPercent: 8,
}

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Guest',
    date: '2026-07-09',
    time: '21:00',
    guests: 2,
    status: 'Confirmed',
    seatingId: 'dinner-2',
    seatingAssignment: {
      assignedUnits: [{ id: 't11', label: 'T11', seatedCapacity: 4, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }
}

function buildTableState(table, reservations, nowMinutes = 1200) {
  const operational = resolveFloorTableOperationalState(reservations, nowMinutes, '2026-07-09')
  return {
    table,
    reservation: operational.displayReservation,
    status: operational.floorStatus,
    operational,
    meta: {},
  }
}

describe('hostFloorTableContent', () => {
  it('renders confirmed reservation as reserved/gold semantic state', () => {
    const reservation = buildReservation({ status: 'Confirmed' })
    const operational = resolveFloorTableOperationalState([reservation], 1200, '2026-07-09')

    expect(resolveHostFloorSemanticClass(operational)).toBe('is-reserved')
    expect(resolveHostFloorVisualPresentation(operational).statusToken).toBe('reserved')
  })

  it('renders in-house reservation as seated/blue semantic state', () => {
    const reservation = buildReservation({ status: 'Checked In' })
    const operational = resolveFloorTableOperationalState([reservation], 1260, '2026-07-09')

    expect(resolveHostFloorSemanticClass(operational)).toBe('is-seated')
    expect(resolveHostFloorVisualPresentation(operational).statusToken).toBe('seated')
  })

  it('renders seating conflict as problem/red semantic state', () => {
    const operational = {
      hostIndicator: 'problem',
      phase: 'available',
      hasSeatingConflict: true,
    }

    expect(resolveHostFloorSemanticClass(operational, { hasSeatingConflict: true })).toBe('has-conflict')
    expect(resolveHostFloorVisualPresentation(operational, { hasSeatingConflict: true }).statusToken).toBe('problem')
  })

  it('renders available table as available/green semantic state', () => {
    const operational = resolveFloorTableOperationalState([], 1200, '2026-07-09')

    expect(resolveHostFloorSemanticClass(operational)).toBe('is-available')
    expect(resolveHostFloorVisualPresentation(operational).statusToken).toBe('available')
  })

  it('preserves operational color for multi-table reservations and marks combined', () => {
    const reservation = buildReservation({ status: 'Checked In' })
    const operational = resolveFloorTableOperationalState([reservation], 1260, '2026-07-09')
    const presentation = resolveHostFloorVisualPresentation(operational, { isMultiLinked: true })

    expect(presentation.semanticClass).toBe('is-seated')
    expect(presentation.isCombined).toBe(true)
  })

  it('does not include status badge words in compact floor content', () => {
    const reservation = buildReservation({ status: 'Checked In', guests: 2 })
    const operational = resolveFloorTableOperationalState([reservation], 1260, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: TABLE,
      operational,
      displayReservation: reservation,
    })

    expect(content.statusBadgeText).toBeNull()
    expect(hostFloorCompactContentIncludesStatusWords(content)).toBe(false)
  })

  it('renders table id, time, and guest count for reserved tables', () => {
    const reservation = buildReservation({ status: 'Confirmed', time: '21:00', guests: 2 })
    const operational = resolveFloorTableOperationalState([reservation], 1200, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: TABLE,
      operational,
      displayReservation: reservation,
    })

    expect(content.tableLabel).toBe('T11')
    expect(content.timeLabel).toBe('21:00')
    expect(content.partyLabel).toBe('2 pax')
    expect(content.mode).toBe('occupied')
  })

  it('renders table id and capacity for available tables', () => {
    const operational = resolveFloorTableOperationalState([], 1200, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: TABLE,
      operational,
    })

    expect(content.tableLabel).toBe('T11')
    expect(content.timeLabel).toBeNull()
    expect(content.partyLabel).toBe('4 pax')
    expect(content.mode).toBe('available')
  })

  it('hides chair dots for occupied/reserved compact tables', () => {
    const reservation = buildReservation({ status: 'Confirmed' })
    const operational = resolveFloorTableOperationalState([reservation], 1200, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: TABLE,
      operational,
      displayReservation: reservation,
    })

    expect(content.showChairDots).toBe(false)
  })

  it('shows chair dots only for available tables when they fit', () => {
    const operational = resolveFloorTableOperationalState([], 1200, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: TABLE,
      operational,
    })

    expect(content.showChairDots).toBe(true)
  })

  it('never combines dinner 1 and dinner 2 reservations in one compact table', () => {
    const dinnerOne = buildReservation({
      id: 'res-d1',
      time: '19:30',
      seatingId: 'dinner-1',
      status: 'Confirmed',
    })
    const dinnerTwo = buildReservation({
      id: 'res-d2',
      time: '21:00',
      seatingId: 'dinner-2',
      status: 'Confirmed',
    })
    const tableState = buildTableState(TABLE, [dinnerOne, dinnerTwo])

    const dinnerOneState = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [dinnerOne, dinnerTwo],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: { tables: [TABLE] },
    })[0]
    const dinnerTwoState = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [dinnerOne, dinnerTwo],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: { tables: [TABLE] },
    })[0]

    const dinnerOneContent = buildHostFloorCompactTableContent({
      table: TABLE,
      operational: dinnerOneState.operational,
      displayReservation: dinnerOneState.operational.displayReservation,
    })
    const dinnerTwoContent = buildHostFloorCompactTableContent({
      table: TABLE,
      operational: dinnerTwoState.operational,
      displayReservation: dinnerTwoState.operational.displayReservation,
    })

    expect(dinnerOneContent.timeLabel).toBe('19:30')
    expect(dinnerTwoContent.timeLabel).toBe('21:00')
    expect(dinnerOneContent.mode).toBe('occupied')
    expect(dinnerTwoContent.mode).toBe('occupied')
  })

  it('updates compact text and semantic color when selected seating changes', () => {
    const reservation = buildReservation({
      id: 'res-d1',
      time: '19:30',
      seatingId: 'dinner-1',
      status: 'Checked In',
    })
    const tableState = buildTableState(TABLE, [reservation], 1170)

    const activeSeatingState = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [reservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: { tables: [TABLE] },
    })[0]
    const inactiveSeatingState = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [reservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: { tables: [TABLE] },
    })[0]

    const activeContent = buildHostFloorCompactTableContent({
      table: TABLE,
      operational: activeSeatingState.operational,
      displayReservation: activeSeatingState.operational.displayReservation,
    })
    const inactiveContent = buildHostFloorCompactTableContent({
      table: TABLE,
      operational: inactiveSeatingState.operational,
      displayReservation: inactiveSeatingState.operational.displayReservation,
    })

    expect(resolveHostFloorSemanticClass(activeSeatingState.operational)).toBe('is-seated')
    expect(resolveHostFloorSemanticClass(inactiveSeatingState.operational)).toBe('is-available')
    expect(activeContent.timeLabel).toBe('19:30')
    expect(inactiveContent.mode).toBe('available')
  })

  it('uses compact guest count on very small tables', () => {
    const reservation = buildReservation({ guests: 2 })
    const operational = resolveFloorTableOperationalState([reservation], 1260, '2026-07-09')
    const tinyTable = { ...TABLE, widthPercent: 5, heightPercent: 5 }

    expect(resolveHostFloorTableContentTier(tinyTable)).toBe(HOST_FLOOR_CONTENT_TIERS.VERY_SMALL)

    const content = buildHostFloorCompactTableContent({
      table: tinyTable,
      operational,
      displayReservation: reservation,
    })

    expect(content.partyLabel).toBe('2p')
  })

  it('maps legend tones to the same semantic CSS tokens as table states', () => {
    HOST_FLOOR_PLAN_LEGEND_ITEMS.forEach((item) => {
      const token = resolveHostFloorLegendToneToken(item.tone)
      expect(token).toBeTruthy()
      expect(token.startsWith('var(--host-floor-')).toBe(true)
    })

    Object.keys(HOST_FLOOR_SEMANTIC_CSS_VARS).forEach((cssVar) => {
      expect(HOST_FLOOR_SEMANTIC_TOKENS.available.dot).toContain('--host-floor-available-dot')
      expect(cssVar.startsWith('--host-floor-')).toBe(true)
    })
  })

  it('does not render status words in compact host floor table DOM', () => {
    const reservation = buildReservation({ status: 'Checked In' })
    const operational = resolveFloorTableOperationalState([reservation], 1260, '2026-07-09')
    const content = buildHostFloorCompactTableContent({
      table: TABLE,
      operational,
      displayReservation: reservation,
    })

    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostFloorCompactTableContent, {
        content,
        linkMeta: null,
        seatingIndicators: [],
      }))
    })

    expect(container.textContent).not.toMatch(/reserved|seated|available|in house|occupied/i)
    expect(container.textContent).toContain('T11')
    expect(container.textContent).toContain('21:00')

    act(() => {
      root.unmount()
    })
  })

  it('formats table labels consistently', () => {
    expect(formatHostFloorTableLabel({ label: '11' })).toBe('T11')
    expect(formatHostFloorTableLabel({ displayLabel: 'T11' })).toBe('T11')
  })
})
