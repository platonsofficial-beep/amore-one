import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickDefaultScheduleDayKey } from './weekUtils'

const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((key) => ({ key }))

describe('0031 schedule default day', () => {
  it('selects today (Tue 3 Nov) not Monday', () => {
    expect(pickDefaultScheduleDayKey(week, '2026-11-03')).toBe('2026-11-03')
  })
  it('falls back to the first day for another week', () => {
    expect(pickDefaultScheduleDayKey(week, '2026-11-10')).toBe('2026-11-02')
  })
  it('uses the device local date by default', () => {
    const d = new Date()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(pickDefaultScheduleDayKey([{ key: 'x' }, { key }])).toBe(key)
  })
  it('handles empty weeks', () => {
    expect(pickDefaultScheduleDayKey([], '2026-11-03')).toBeNull()
  })
})

describe('0031 modals above the sidebar', () => {
  const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
  it('lifts .main-panel while a modal is open', () => {
    expect(css).toMatch(/\.main-panel:has\(\.employee-modal-backdrop, \.task-modal-backdrop, \[aria-modal='true'\]\) \{\s*z-index: 1200;/)
  })
})
