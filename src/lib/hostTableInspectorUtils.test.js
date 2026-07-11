/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest'
import {
  buildHostTableInspectorContextStrip,
  buildHostTableInspectorSummary,
  formatInspectorExtraChairLabel,
  groupInspectorRowsForRender,
  resolveInspectorPrimaryRowId,
  shouldCompactHostFloorSelectionCard,
  shouldUseHostTableInspectorDrawer,
  sortInspectorRowsForPresentation,
} from './hostTableInspectorUtils'

describe('hostTableInspectorUtils', () => {
  describe('shouldUseHostTableInspectorDrawer', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    })

    it('returns false on phone widths', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
      expect(shouldUseHostTableInspectorDrawer()).toBe(false)
    })

    it('returns false on tablet portrait', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1024 })
      expect(shouldUseHostTableInspectorDrawer()).toBe(false)
    })

    it('returns true on landscape tablet/desktop widths', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 820 })
      expect(shouldUseHostTableInspectorDrawer()).toBe(true)
    })
  })

  describe('buildHostTableInspectorContextStrip', () => {
    it('renders compact occupied context strip', () => {
      expect(buildHostTableInspectorContextStrip([{
        reservation: { guestName: 'Fournie', time: '20:30' },
        seating: { name: 'Dinner 2' },
        hasConflict: false,
      }])).toEqual({
        kind: 'occupied',
        contextLine: '🟢 Occupied · Since 20:30',
        guestLine: 'Fournie',
      })
    })

    it('renders available-now strip when no occupant', () => {
      expect(buildHostTableInspectorContextStrip([{
        reservation: null,
        isAvailable: true,
        hasConflict: false,
        seating: { name: 'Brunch' },
      }])).toEqual({
        kind: 'available',
        contextLine: 'Available now',
        guestLine: '',
      })
    })
  })

  describe('buildHostTableInspectorSummary', () => {
    it('keeps legacy summary adapter for occupied rows', () => {
      expect(buildHostTableInspectorSummary([{
        reservation: { guestName: 'Fournie', time: '20:30' },
        hasConflict: false,
      }])).toMatchObject({
        kind: 'occupied',
        primary: 'Occupied',
        secondary: 'Fournie',
      })
    })
  })

  describe('formatInspectorExtraChairLabel', () => {
    it('formats singular and plural extra-chair labels', () => {
      expect(formatInspectorExtraChairLabel(0)).toBe('')
      expect(formatInspectorExtraChairLabel(1)).toBe('+1 extra chair')
      expect(formatInspectorExtraChairLabel(2)).toBe('+2 extra chairs')
    })
  })

  describe('resolveInspectorPrimaryRowId', () => {
    it('prefers seated rows as the hero target', () => {
      expect(resolveInspectorPrimaryRowId([
        { seating: { id: 'brunch' }, isAvailable: true, hasConflict: false },
        { seating: { id: 'dinner' }, reservation: {}, state: 'seated', hasConflict: false },
      ])).toBe('dinner')
    })
  })

  describe('sortInspectorRowsForPresentation', () => {
    it('orders occupied before available while preserving ties', () => {
      const sorted = sortInspectorRowsForPresentation([
        { seating: { id: 'brunch' }, isAvailable: true, hasConflict: false },
        { seating: { id: 'dinner' }, reservation: {}, state: 'seated', hasConflict: false },
      ])
      expect(sorted.map((row) => row.seating.id)).toEqual(['dinner', 'brunch'])
    })
  })

  describe('shouldCompactHostFloorSelectionCard', () => {
    it('compacts when inspector shows the same reservation', () => {
      expect(shouldCompactHostFloorSelectionCard({
        inspectorOpen: true,
        selectedReservation: { id: 'res-1' },
        inspectorRows: [{ reservation: { id: 'res-1' }, hasConflict: false }],
      })).toBe(true)
    })

    it('keeps full card when inspector shows a different reservation', () => {
      expect(shouldCompactHostFloorSelectionCard({
        inspectorOpen: true,
        selectedReservation: { id: 'res-1' },
        inspectorRows: [{ reservation: { id: 'res-2' }, hasConflict: false }],
      })).toBe(false)
    })
  })

  describe('groupInspectorRowsForRender', () => {
    it('groups consecutive available rows into one timeline in drawer mode', () => {
      const brunch = { seating: { id: 'brunch' }, isAvailable: true, hasConflict: false }
      const lunch = { seating: { id: 'lunch' }, isAvailable: true, hasConflict: false }
      const dinner = {
        seating: { id: 'dinner' },
        reservation: {},
        state: 'seated',
        hasConflict: false,
      }

      expect(groupInspectorRowsForRender([dinner, brunch, lunch], true)).toEqual([
        { type: 'card', row: dinner },
        { type: 'available-timeline', rows: [brunch, lunch] },
      ])
    })

    it('keeps card rows in dialog mode', () => {
      const row = { seating: { id: 'brunch' }, isAvailable: true, hasConflict: false }
      expect(groupInspectorRowsForRender([row], false)).toEqual([{ type: 'card', row }])
    })
  })
})
