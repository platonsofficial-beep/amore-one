import { describe, expect, it } from 'vitest'
import { normalizeRotation, stepRotation } from './tableTransformUtils'

describe('stepRotation', () => {
  it('steps rotation by the requested delta', () => {
    expect(stepRotation(0, 45)).toBe(45)
    expect(stepRotation(350, 45)).toBe(35)
    expect(stepRotation(10, -45)).toBe(325)
  })

  it('normalizes invalid values before stepping', () => {
    expect(stepRotation('90', 45)).toBe(135)
    expect(normalizeRotation(-15)).toBe(345)
  })
})
