import { describe, expect, it } from 'vitest'
import { demoPersonName, resolveDemoDisplayName, withDemoAttendance } from './demoAttendance'

describe('demo attendance', () => {
  it('uses Elena in English and Έλενα in Greek', () => {
    expect(demoPersonName('en')).toBe('Elena')
    expect(demoPersonName('el')).toBe('Έλενα')
    expect(resolveDemoDisplayName('Elena Christodoulou', 'el')).toBe('Έλενα')
    expect(resolveDemoDisplayName('Elena Christodoulou', 'en')).toBe('Elena')
    expect(resolveDemoDisplayName('Μαρία Γεωργίου', 'el')).toBe('Μαρία Γεωργίου')
  })

  it('adds a venue pin and a shift today when the demo has neither', () => {
    const next = withDemoAttendance(
      { settings: null, entries: [], breaks: [], shifts: [] },
      { employeeId: 'dev-elena', todayKey: '2026-11-15', area: 'Κύρια σάλα' },
    )
    expect(next.settings.venue_lat).toBeTypeOf('number')
    expect(next.settings.venue_lng).toBeTypeOf('number')
    expect(next.shifts).toEqual([
      expect.objectContaining({
        employee_id: 'dev-elena',
        shift_date: '2026-11-15',
        start_time: '16:00',
        end_time: '23:00',
        area: 'Κύρια σάλα',
      }),
    ])
  })

  it('keeps a venue pin and shift that are already stored', () => {
    const next = withDemoAttendance({
      settings: { venue_lat: 1, venue_lng: 2 },
      shifts: [{ employee_id: 'dev-elena', shift_date: '2026-11-15', start_time: '09:00', end_time: '17:00' }],
    }, { employeeId: 'dev-elena', todayKey: '2026-11-15' })
    expect(next.settings).toEqual({ venue_lat: 1, venue_lng: 2 })
    expect(next.shifts).toHaveLength(1)
    expect(next.shifts[0].start_time).toBe('09:00')
  })
})
