/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest'
import {
  buildHostTableInspectorSummary,
  shouldCompactHostFloorSelectionCard,
  shouldUseHostTableInspectorDrawer,
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

  describe('buildHostTableInspectorSummary', () => {
    it('summarizes occupied table state', () => {
      expect(buildHostTableInspectorSummary([{
        reservation: { guestName: 'Fournie', time: '20:30' },
        seating: { name: 'Dinner 2' },
        hasConflict: false,
      }])).toMatchObject({
        kind: 'occupied',
        primary: 'Occupied',
        secondary: 'Fournie',
        detail: 'Since 20:30',
      })
    })

    it('summarizes available table state', () => {
      expect(buildHostTableInspectorSummary([{
        reservation: null,
        isAvailable: true,
        hasConflict: false,
        seating: { name: 'Dinner 1' },
        timeWindowLabel: '19:00–21:00',
      }])).toMatchObject({
        kind: 'available',
        primary: 'Available now',
        secondary: 'Dinner 1',
      })
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
})
