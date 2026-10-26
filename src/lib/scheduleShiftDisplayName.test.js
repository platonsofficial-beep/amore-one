import { describe, expect, it } from 'vitest'
import { formatScheduleShiftDisplayName } from './scheduleShiftDisplayName'

describe('formatScheduleShiftDisplayName', () => {
  it('shows Evening and Evening Shift as the same name', () => {
    expect(formatScheduleShiftDisplayName('Evening')).toBe('Evening')
    expect(formatScheduleShiftDisplayName('Evening Shift')).toBe('Evening')
    expect(formatScheduleShiftDisplayName('evening shift', 'Bar')).toBe('Evening')
  })

  it('keeps a department prefix from swallowing the shift name', () => {
    expect(formatScheduleShiftDisplayName('Evening Shift', 'Evening')).toBe('Evening')
    expect(formatScheduleShiftDisplayName('Bar Evening', 'Bar')).toBe('Evening')
  })

  it('does not rewrite a name that is only the word Shift', () => {
    expect(formatScheduleShiftDisplayName('Shift')).toBe('Shift')
    expect(formatScheduleShiftDisplayName('Morning Shift')).toBe('Morning')
  })
})
