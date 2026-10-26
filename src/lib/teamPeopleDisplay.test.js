import { describe, expect, it } from 'vitest'
import {
  formatEmployeeSalaryDisplay,
  formatEmployeeWeeklyHoursDisplay,
  formatStoredPhoneForDisplay,
} from './teamPeopleDisplay'

describe('team people display', () => {
  it('puts a space after the country code', () => {
    expect(formatStoredPhoneForDisplay('+35799123456')).toBe('+357 99123456')
    expect(formatStoredPhoneForDisplay('+357 99123456')).toBe('+357 99123456')
    expect(formatStoredPhoneForDisplay('99123456')).toBe('99123456')
  })

  it('shows salary in euros and weekly hours with h', () => {
    expect(formatEmployeeSalaryDisplay(1800)).toBe('€1800')
    expect(formatEmployeeSalaryDisplay('€1800')).toBe('€1800')
    expect(formatEmployeeSalaryDisplay('')).toBe('—')
    expect(formatEmployeeWeeklyHoursDisplay(40)).toBe('40h')
    expect(formatEmployeeWeeklyHoursDisplay('40h')).toBe('40h')
    expect(formatEmployeeWeeklyHoursDisplay('')).toBe('—')
  })
})
