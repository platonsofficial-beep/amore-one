import { describe, expect, it } from 'vitest'
import { getTableHandleMetrics, getTableHandleSize } from './tableHandleMetrics'

describe('getTableHandleSize', () => {
  it('shrinks handles on small tables so the body stays draggable', () => {
    expect(getTableHandleSize(90)).toBe(23)
    expect(getTableHandleSize(140)).toBe(36)
  })

  it('caps handles at the tablet touch target maximum on large tables', () => {
    expect(getTableHandleSize(220)).toBe(44)
  })
})

describe('getTableHandleMetrics', () => {
  it('pushes selection chrome outward as handle size grows', () => {
    const small = getTableHandleMetrics(90)
    const large = getTableHandleMetrics(220)

    expect(small.handleSize).toBeLessThan(large.handleSize)
    expect(small.chromeInset).toBeLessThan(large.chromeInset)
  })
})
