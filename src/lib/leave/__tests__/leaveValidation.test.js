// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { validateLeaveDates } from '../leaveValidation'

describe('leaveValidation', () => {
  const workspaceToday = '2026-07-15'

  it('accepts a valid inclusive date range', () => {
    expect(validateLeaveDates({
      startDate: '2026-07-20',
      endDate: '2026-07-22',
      workspaceToday,
    })).toEqual({
      ok: true,
      error: '',
      startDate: '2026-07-20',
      endDate: '2026-07-22',
      durationDays: 3,
    })
  })

  it('accepts a single-day request', () => {
    expect(validateLeaveDates({
      startDate: '2026-07-20',
      endDate: '2026-07-20',
      workspaceToday,
    })).toMatchObject({
      ok: true,
      durationDays: 1,
    })
  })

  it('requires start and end dates', () => {
    expect(validateLeaveDates({ endDate: '2026-07-20', workspaceToday })).toEqual({
      ok: false,
      error: 'Start date is required.',
    })
    expect(validateLeaveDates({ startDate: '2026-07-20', workspaceToday })).toEqual({
      ok: false,
      error: 'End date is required.',
    })
  })

  it('rejects end before start', () => {
    expect(validateLeaveDates({
      startDate: '2026-07-22',
      endDate: '2026-07-20',
      workspaceToday,
    })).toEqual({
      ok: false,
      error: 'End date must be on or after start date.',
    })
  })

  it('rejects invalid calendar dates', () => {
    expect(validateLeaveDates({
      startDate: '2026-02-30',
      endDate: '2026-03-01',
      workspaceToday,
    })).toEqual({
      ok: false,
      error: 'Start date is required.',
    })
  })

  it('blocks past requests for staff by default', () => {
    expect(validateLeaveDates({
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      workspaceToday,
    })).toEqual({
      ok: false,
      error: 'Leave cannot be requested for past dates.',
    })
  })

  it('allows past requests when manager override is enabled', () => {
    expect(validateLeaveDates({
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      workspaceToday,
      allowPastRequests: true,
    })).toMatchObject({
      ok: true,
      durationDays: 10,
    })
  })

  it('allows requests starting today even when end is in the future', () => {
    expect(validateLeaveDates({
      startDate: workspaceToday,
      endDate: '2026-07-20',
      workspaceToday,
    })).toMatchObject({ ok: true })
  })

  it('rejects ranges longer than 365 days', () => {
    expect(validateLeaveDates({
      startDate: '2026-01-01',
      endDate: '2027-01-02',
      workspaceToday,
      allowPastRequests: true,
    })).toEqual({
      ok: false,
      error: 'Leave duration exceeds the maximum allowed range.',
    })
  })

  it('normalizes ISO datetime inputs to date keys', () => {
    expect(validateLeaveDates({
      startDate: '2026-07-20T09:00:00.000Z',
      endDate: '2026-07-22T18:00:00.000Z',
      workspaceToday,
    })).toMatchObject({
      ok: true,
      startDate: '2026-07-20',
      endDate: '2026-07-22',
    })
  })
})
