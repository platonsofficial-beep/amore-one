import { describe, expect, it } from 'vitest'
import { buildCopyDayTargetGroups } from './scheduleCopyDayTargets'

describe('buildCopyDayTargetGroups', () => {
  it('offers the open week and the next two weeks, without the source day', () => {
    const groups = buildCopyDayTargetGroups({
      weekStartDate: '2026-10-26',
      sourceDate: '2026-10-26',
      weeksAhead: 2,
    })

    expect(groups.map((group) => group.label)).toEqual([
      'This week',
      'Next week',
      'Following week',
    ])
    expect(groups[0].days.map((day) => day.key)).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(groups[1].days.map((day) => day.key)[0]).toBe('2026-11-02')
    expect(groups[1].days).toHaveLength(7)
    expect(groups[2].days.map((day) => day.key)[0]).toBe('2026-11-09')
    expect(groups.flatMap((group) => group.days.map((day) => day.key))).not.toContain('2026-10-26')
  })
})