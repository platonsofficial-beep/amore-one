import { describe, expect, it } from 'vitest'
import { entryPersonName } from './AttendanceBoard'

describe('entryPersonName', () => {
  it('uses the employee name while the employee exists', () => {
    expect(entryPersonName({ employee_id: 'e1', member: { display_name: 'Old' } }, [{ id: 'e1', name: 'Maria' }])).toBe('Maria')
  })
  it('keeps the name of a deleted employee from their membership', () => {
    expect(entryPersonName({ employee_id: null, member: { display_name: 'TEST Delete Person' } }, [])).toBe('TEST Delete Person')
  })
  it('falls back to Team member when nothing is known', () => {
    expect(entryPersonName({ employee_id: null }, [])).toBe('Team member')
  })
})
