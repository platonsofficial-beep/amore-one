import { describe, expect, it } from 'vitest'
import {
  buildHourOptions,
  buildMinuteOptions,
  formatHourMinute,
  parseHourMinute,
} from './hourMinuteField'

describe('hourMinuteField', () => {
  it('reads a 24-hour clock and ignores a 12-hour label', () => {
    expect(parseHourMinute('23:00:00')).toEqual({ hour: '23', minute: '00' })
    expect(parseHourMinute('8:00')).toEqual({ hour: '08', minute: '00' })
    expect(parseHourMinute('11:00 PM')).toEqual({ hour: '', minute: '' })
    expect(parseHourMinute('')).toEqual({ hour: '', minute: '' })
    expect(parseHourMinute('24:00')).toEqual({ hour: '', minute: '' })
  })

  it('offers every hour and 15-minute steps, keeping an off-step minute', () => {
    expect(buildHourOptions()).toEqual([
      '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
      '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23',
    ])
    expect(buildMinuteOptions(15)).toEqual(['00', '15', '30', '45'])
    expect(buildMinuteOptions(15, '07')).toEqual(['00', '07', '15', '30', '45'])
  })

  it('formats only a complete HH:MM value', () => {
    expect(formatHourMinute('23', '00')).toBe('23:00')
    expect(formatHourMinute('7', '5')).toBe('07:05')
    expect(formatHourMinute('23', '')).toBe('')
    expect(formatHourMinute('', '')).toBe('')
  })
})
