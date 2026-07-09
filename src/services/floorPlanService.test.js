import { describe, expect, it } from 'vitest'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.trim()

  if (code === '42P01') return true
  if (message.includes('could not find the table') && message.includes('floor_plans')) return true
  if (message.includes('schema cache') && message.includes('floor_plans')) return true
  return false
}

function isFloorPlanPermissionError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.trim()

  return code === '42501'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('not authorized')
}

describe('floorPlanService error detection', () => {
  it('detects missing floor_plans table errors only', () => {
    expect(isTableUnavailableError({ code: '42P01', message: 'relation does not exist' })).toBe(true)
    expect(isTableUnavailableError({
      message: 'Could not find the table public.floor_plans in the schema cache',
    })).toBe(true)
    expect(isTableUnavailableError({
      message: 'new row violates row-level security policy for table floor_plans',
    })).toBe(false)
    expect(isTableUnavailableError({
      message: 'permission denied for relation floor_plans',
    })).toBe(false)
  })

  it('detects permission errors separately from missing-table errors', () => {
    expect(isFloorPlanPermissionError({
      code: '42501',
      message: 'new row violates row-level security policy',
    })).toBe(true)
    expect(isFloorPlanPermissionError({
      message: 'permission denied for table floor_plans',
    })).toBe(true)
  })
})
